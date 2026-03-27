import 'server-only';

import bcrypt from 'bcryptjs';
import { getValidatedSession, type ValidatedSession } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt, resetAttempts } from '@/lib/rate-limiter';

export const ROLE_GROUPS = {
    ADMIN: ['ADMIN', 'GERENTE_GENERAL'] as const,
    MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const,
    MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'] as const,
    OVERRIDE: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'] as const,
    TREASURY_AUTH: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'TESORERO'] as const,
} as const;

const DEVELOPMENT_MASTER_PIN = '1213';

export type PinRbacActor = ValidatedSession;

export type PinRbacErrorCode =
    | 'AUTH_UNAUTHORIZED'
    | 'AUTH_FORBIDDEN'
    | 'PIN_INVALID'
    | 'PIN_RATE_LIMITED'
    | 'PIN_USER_MISMATCH';

export class PinRbacError extends Error {
    code: PinRbacErrorCode;

    constructor(code: PinRbacErrorCode, message: string) {
        super(message);
        this.name = 'PinRbacError';
        this.code = code;
    }
}

export interface PinAuthorizedUser {
    id: string;
    name: string;
    role: string;
}

export interface PinValidationOptions {
    allowLegacyPlaintext?: boolean;
    useRateLimiter?: boolean;
    allowDevelopmentMasterPin?: boolean;
    requiredMatchUserId?: string;
}

type PinValidationFailure =
    | { valid: false; code: 'PIN_INVALID'; error: string }
    | { valid: false; code: 'PIN_RATE_LIMITED'; error: string }
    | { valid: false; code: 'PIN_USER_MISMATCH'; error: string };

type PinValidationSuccess = {
    valid: true;
    authorizedBy: PinAuthorizedUser;
    matchedBy: 'hash' | 'legacy_plaintext' | 'development_master_pin';
};

export type PinValidationResult = PinValidationFailure | PinValidationSuccess;

export interface PinQueryUserRow {
    id: string;
    name: string;
    role: string;
    access_pin_hash?: string | null;
    access_pin?: string | null;
}

export interface PinQueryClient {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: PinQueryUserRow[] }>;
}

export function normalizeRole(role: string | null | undefined) {
    return String(role || '').trim().toUpperCase();
}

export async function getActorOrFail(): Promise<PinRbacActor> {
    const session = await getValidatedSession();
    if (!session) {
        throw new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.');
    }

    return {
        ...session,
        role: normalizeRole(session.role),
    };
}

export function requireRole(actor: PinRbacActor, allowedRoles: readonly string[]) {
    const allowed = allowedRoles.map(normalizeRole);
    const normalizedActor = {
        ...actor,
        role: normalizeRole(actor.role),
    };

    if (!allowed.includes(normalizedActor.role)) {
        throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
    }

    return normalizedActor;
}

function isDevelopmentMasterPinAllowed(pin: string, options: PinValidationOptions) {
    return process.env.NODE_ENV !== 'production'
        && options.allowDevelopmentMasterPin === true
        && pin === DEVELOPMENT_MASTER_PIN;
}

function buildUserRow(row: PinQueryUserRow): PinAuthorizedUser {
    return {
        id: row.id,
        name: row.name,
        role: normalizeRole(row.role),
    };
}

async function validateAgainstUser(
    candidate: PinQueryUserRow,
    pin: string,
    options: PinValidationOptions
): Promise<PinValidationResult> {
    if (options.requiredMatchUserId && candidate.id !== options.requiredMatchUserId) {
        return {
            valid: false,
            code: 'PIN_USER_MISMATCH',
            error: 'El PIN no corresponde al usuario requerido',
        };
    }

    if (isDevelopmentMasterPinAllowed(pin, options)) {
        return {
            valid: true,
            authorizedBy: buildUserRow(candidate),
            matchedBy: 'development_master_pin',
        };
    }

    if (candidate.access_pin_hash) {
        const validHash = await bcrypt.compare(pin, candidate.access_pin_hash);
        if (validHash) {
            return {
                valid: true,
                authorizedBy: buildUserRow(candidate),
                matchedBy: 'hash',
            };
        }
    }

    if (options.allowLegacyPlaintext && candidate.access_pin && candidate.access_pin === pin) {
        return {
            valid: true,
            authorizedBy: buildUserRow(candidate),
            matchedBy: 'legacy_plaintext',
        };
    }

    return {
        valid: false,
        code: 'PIN_INVALID',
        error: 'PIN inválido',
    };
}

async function evaluateCandidate(
    candidate: PinQueryUserRow,
    pin: string,
    options: PinValidationOptions
): Promise<PinValidationResult> {
    if (options.useRateLimiter) {
        const rateCheck = checkRateLimit(candidate.id);
        if (!rateCheck.allowed) {
            return {
                valid: false,
                code: 'PIN_RATE_LIMITED',
                error: rateCheck.reason || 'Usuario temporalmente bloqueado',
            };
        }
    }

    const result = await validateAgainstUser(candidate, pin, options);

    if (options.useRateLimiter) {
        if (result.valid) {
            resetAttempts(candidate.id);
        } else if (result.code === 'PIN_INVALID') {
            recordFailedAttempt(candidate.id);
        }
    }

    return result;
}

export async function validatePinForRoles(
    client: PinQueryClient,
    pin: string,
    allowedRoles: readonly string[],
    options: PinValidationOptions = {}
): Promise<PinValidationResult> {
    const normalizedRoles = allowedRoles.map(normalizeRole);

    const usersRes = await client.query(
        `
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users
            WHERE role = ANY($1::text[])
              AND is_active = true
        `,
        [normalizedRoles]
    );

    for (const user of usersRes.rows) {
        const result = await evaluateCandidate(user, pin, options);
        if (result.valid) {
            return result;
        }
        if (result.code === 'PIN_RATE_LIMITED') {
            return result;
        }
    }

    return {
        valid: false,
        code: 'PIN_INVALID',
        error: 'PIN inválido',
    };
}

export async function validatePinForUser(
    client: PinQueryClient,
    userId: string,
    pin: string,
    options: PinValidationOptions = {}
): Promise<PinValidationResult> {
    const usersRes = await client.query(
        `
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users
            WHERE id = $1
              AND is_active = true
            LIMIT 1
        `,
        [userId]
    );

    if (usersRes.rows.length === 0) {
        return {
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        };
    }

    const candidate = usersRes.rows[0];
    const enforcedOptions: PinValidationOptions = {
        ...options,
        requiredMatchUserId: options.requiredMatchUserId || userId,
    };

    return evaluateCandidate(candidate, pin, enforcedOptions);
}
