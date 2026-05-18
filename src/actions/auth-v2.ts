'use server';

import * as Sentry from '@sentry/nextjs';
import { query } from '@/lib/db';
import { classifyPgError } from '@/lib/db-errors';
import { createCorrelationId, type ActionFailure } from '@/lib/action-response';
import { logger } from '@/lib/logger';
import {
    createServerSession,
    getValidatedSession,
    invalidateCurrentSession,
} from '@/lib/server-session';
import {
    type PinQueryClient,
    ROLE_GROUPS,
    normalizeRole,
    validatePinForRoles,
    validatePinForUser,
} from '@/lib/pin-rbac';

export interface AuthenticatedUser {
    id: string;
    name: string;
    role: string;
    assigned_location_id?: string | null;
    token_version?: number;
}

export type AuthActionResult =
    | { success: true; user: AuthenticatedUser; isTemporaryPin?: boolean }
    | ActionFailure;

function authFailure(input: {
    code: string;
    userMessage: string;
    retryable?: boolean;
    correlationId?: string;
}): ActionFailure {
    return {
        success: false,
        error: input.userMessage,
        code: input.code,
        retryable: input.retryable ?? false,
        correlationId: input.correlationId || createCorrelationId(),
        userMessage: input.userMessage,
    };
}

type AuthPinQueryParam = string | number | boolean | Date | string[] | null | undefined;

const pinQueryClient: PinQueryClient = {
    query: (sql, params) =>
        query(sql, params as AuthPinQueryParam[] | undefined) as Promise<Awaited<ReturnType<PinQueryClient['query']>>>,
};

const supervisorPinBaseRoles =
    (ROLE_GROUPS as { OVERRIDE?: readonly string[] }).OVERRIDE ?? ROLE_GROUPS.MANAGER;

const SUPERVISOR_PIN_ROLE_ALLOWLIST = new Set<string>(
    supervisorPinBaseRoles.map((role) => normalizeRole(role))
);

function resolveSupervisorPinRoles(requiredRoles: string[]) {
    const requestedRoles = requiredRoles.length > 0 ? requiredRoles : [...ROLE_GROUPS.MANAGER];
    return Array.from(new Set(
        requestedRoles
            .map((role) => normalizeRole(role))
            .filter((role) => SUPERVISOR_PIN_ROLE_ALLOWLIST.has(role))
    ));
}

export async function getSessionSecure() {
    return getValidatedSession();
}

export async function verifyUserPin(userId: string, pin: string) {
    try {
        if (!userId || !pin) return { success: false, error: 'Datos incompletos' };

        const res = await query('SELECT role FROM users WHERE id = $1', [userId]);

        if ((res.rowCount ?? 0) === 0) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        const userData = res.rows[0];
        const normalizedRole = String(userData.role || '').trim().toUpperCase();

        if (!ROLE_GROUPS.MANAGER.includes(normalizedRole as typeof ROLE_GROUPS.MANAGER[number])) {
            return { success: false, error: 'Sin permisos suficientes' };
        }

        const result = await validatePinForUser(pinQueryClient, userId, pin, {
            allowLegacyPlaintext: true,
        });

        if (result.valid) {
            return { success: true };
        }

        return { success: false, error: result.error === 'PIN inválido' ? 'PIN Incorrecto' : result.error };
    } catch (error) {
        const correlationId = createCorrelationId();
        Sentry.captureException(error, {
            tags: { module: 'auth-v2', action: 'verifyUserPin' },
            extra: { correlationId, userId },
        });
        logger.error({ correlationId, userId, error }, 'Error verifying PIN');
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, error: errorMessage };
    }
}

/**
 * Validates supervisor PIN for overrides (POS, Inventory, etc)
 */
export async function validateSupervisorPin(
    pin: string,
    requiredRoles: string[] = [...ROLE_GROUPS.MANAGER]
) {
    try {
        const session = await getValidatedSession();
        if (!session) {
            return { success: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' };
        }

        const allowedRoles = resolveSupervisorPinRoles(requiredRoles);
        if (allowedRoles.length === 0) {
            logger.warn({ requestedRoles: requiredRoles }, 'Validate Supervisor PIN rejected invalid role set');
            return { success: false, error: 'Rol de autorización no permitido' };
        }

        const result = await validatePinForRoles(pinQueryClient, pin, allowedRoles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { success: false, error: result.code === 'PIN_RATE_LIMITED' ? result.error : 'PIN inválido o sin permisos' };
        }

        return {
            success: true,
            authorizedBy: result.authorizedBy,
        };
    } catch (error) {
        const correlationId = createCorrelationId();
        Sentry.captureException(error, {
            tags: { module: 'auth-v2', action: 'validateSupervisorPin' },
            extra: { correlationId, requiredRoles },
        });
        logger.error({ correlationId, error, requiredRoles }, 'Validate Supervisor PIN error');
        return { success: false, error: 'Error de servidor' };
    }
}

/**
 * Main secure authentication for login
 */
export async function authenticateUserSecure(userId: string, pin: string, locationId?: string): Promise<AuthActionResult> {
    try {
        if (!userId || !pin) {
            return authFailure({
                code: 'AUTH_VALIDATION',
                userMessage: 'Credenciales incompletas',
                retryable: false,
            });
        }

        const res = await query(`
            SELECT id, name, role, access_pin_hash, access_pin, assigned_location_id, is_active
            FROM users
            WHERE id = $1
        `, [userId]);

        if ((res.rowCount ?? 0) === 0) {
            return authFailure({
                code: 'AUTH_USER_NOT_FOUND',
                userMessage: 'Usuario no encontrado',
                retryable: false,
            });
        }

        const user = res.rows[0];

        if (!user.is_active) {
            return authFailure({
                code: 'AUTH_USER_INACTIVE',
                userMessage: 'Usuario inactivo',
                retryable: false,
            });
        }

        const pinValidation = await validatePinForUser(pinQueryClient, user.id, pin, {
            allowLegacyPlaintext: true,
        });

        if (!pinValidation.valid) {
            // V2: Soporte para PIN Temporal (Recuperación por Email)
            const { checkIfIsPinTemporary } = await import('./pin-recovery-v2');
            const { isTemporary } = await checkIfIsPinTemporary(user.id, pin);

            if (!isTemporary) {
                return authFailure({
                    code: 'AUTH_INVALID_PIN',
                    userMessage: 'PIN incorrecto',
                    retryable: false,
                });
            }

            // Es un PIN temporal válido!
            const targetLocationId = locationId || user.assigned_location_id;
            const { tokenVersion } = await createServerSession({
                userId: user.id,
                userName: user.name,
                role: user.role,
                locationId: targetLocationId,
            });

            return {
                success: true,
                isTemporaryPin: true, // Flag crucial para la UI
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    assigned_location_id: user.assigned_location_id,
                    token_version: tokenVersion,
                }
            };
        }

        const targetLocationId = locationId || user.assigned_location_id;
        const { tokenVersion } = await createServerSession({
            userId: user.id,
            userName: user.name,
            role: user.role,
            locationId: targetLocationId,
        });

        return {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                assigned_location_id: user.assigned_location_id,
                token_version: tokenVersion,
            }
        };

    } catch (error) {
        const correlationId = createCorrelationId();
        const classified = classifyPgError(error);

        Sentry.captureException(error, {
            tags: {
                module: 'auth-v2',
                action: 'authenticateUserSecure',
                code: classified.code,
            },
            extra: {
                correlationId,
                retryable: classified.retryable,
            },
        });

        logger.error(
            {
                correlationId,
                code: classified.code,
                retryable: classified.retryable,
                technicalMessage: classified.technicalMessage,
            },
            'Auth login failed'
        );

        return authFailure({
            code: classified.code,
            retryable: classified.retryable,
            correlationId,
            userMessage: classified.userMessage,
        });
    }
}

export async function logoutCurrentSessionSecure() {
    await invalidateCurrentSession();
}
