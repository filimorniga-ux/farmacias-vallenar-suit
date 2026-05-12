import 'server-only';

import { query } from '@/lib/db';
import {
    getActorOrFail,
    normalizeRole,
    PinRbacError,
    requireRole,
    type PinRbacActor,
} from '@/lib/pin-rbac';
import { resolveScopedLocation } from './scoped-location';

type Queryable = {
    query: (sql: string, params?: Array<string | number | boolean | Date | string[] | null | undefined>) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export type PosActor = PinRbacActor;

export const POS_ALLOWED_ROLES = [
    'CASHIER',
    'QF',
    'MANAGER',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;

export const POS_SUPERVISOR_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const POS_GLOBAL_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

function asQueryable(executor?: Queryable) {
    return executor ?? { query };
}

export function hasGlobalPosScope(role: string) {
    return POS_GLOBAL_ROLES.includes(
        normalizeRole(role) as typeof POS_GLOBAL_ROLES[number],
    );
}

export async function requirePosActor(
    allowedRoles: readonly string[] = POS_ALLOWED_ROLES,
    action = 'pos-operation',
): Promise<{ success: true; actor: PosActor } | { success: false; error: string }> {
    try {
        const actor = requireRole(await getActorOrFail(), allowedRoles);
        return { success: true, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return {
                success: false,
                error: error.code === 'AUTH_UNAUTHORIZED'
                    ? 'Sesión no válida. Vuelve a iniciar sesión.'
                    : 'Acceso denegado',
            };
        }

        return { success: false, error: `Error resolviendo actor para ${action}` };
    }
}

export function resolveEffectivePosLocation(
    actor: PosActor,
    requestedLocationId?: string | null,
): { success: true; locationId?: string } | { success: false; error: string } {
    return resolveScopedLocation(actor, requestedLocationId, hasGlobalPosScope);
}

export async function ensureTerminalInPosScope(
    terminalId: string,
    actor: PosActor,
    executor?: Queryable,
): Promise<
    | { success: true; terminal: Record<string, unknown>; locationId?: string }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const terminalRes = await db.query(
        `
            SELECT
                id::text AS id,
                location_id::text AS location_id,
                current_cashier_id::text AS current_cashier_id,
                status
            FROM terminals
            WHERE id::text = $1::text
            LIMIT 1
        `,
        [terminalId],
    );

    const terminal = terminalRes.rows[0];
    if (!terminal) {
        return { success: false, error: 'Terminal no encontrado' };
    }

    const locationId = String(terminal.location_id || '') || undefined;
    if (locationId) {
        const scope = resolveEffectivePosLocation(actor, locationId);
        if (!scope.success) {
            return scope;
        }
    } else if (!hasGlobalPosScope(actor.role)) {
        return { success: false, error: 'El terminal no tiene una ubicación válida para este actor' };
    }

    return {
        success: true,
        terminal,
        locationId,
    };
}

export async function ensureSessionInPosScope(
    sessionId: string,
    actor: PosActor,
    executor?: Queryable,
): Promise<
    | { success: true; session: Record<string, unknown>; locationId?: string }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const sessionRes = await db.query(
        `
            SELECT
                s.id::text AS id,
                s.terminal_id::text AS terminal_id,
                s.user_id::text AS user_id,
                s.status,
                s.closed_at,
                t.location_id::text AS location_id
            FROM cash_register_sessions s
            JOIN terminals t ON t.id = s.terminal_id
            WHERE s.id::text = $1::text
            LIMIT 1
        `,
        [sessionId],
    );

    const session = sessionRes.rows[0];
    if (!session) {
        return { success: false, error: 'Sesión no encontrada' };
    }

    const locationId = String(session.location_id || '') || undefined;
    if (locationId) {
        const scope = resolveEffectivePosLocation(actor, locationId);
        if (!scope.success) {
            return scope;
        }
    } else if (!hasGlobalPosScope(actor.role)) {
        return { success: false, error: 'La sesión no tiene una ubicación válida para este actor' };
    }

    return {
        success: true,
        session,
        locationId,
    };
}

export async function resolvePosContextScope(
    actor: PosActor,
    params: {
        locationId?: string | null;
        terminalId?: string | null;
        sessionId?: string | null;
    },
    executor?: Queryable,
): Promise<
    | {
        success: true;
        locationId?: string;
        terminal?: Record<string, unknown>;
        session?: Record<string, unknown>;
    }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    let effectiveLocationId = params.locationId || undefined;
    let terminal: Record<string, unknown> | undefined;
    let session: Record<string, unknown> | undefined;

    if (params.terminalId) {
        const terminalScope = await ensureTerminalInPosScope(params.terminalId, actor, db);
        if (!terminalScope.success) {
            return terminalScope;
        }

        terminal = terminalScope.terminal;
        if (effectiveLocationId && terminalScope.locationId && effectiveLocationId !== terminalScope.locationId) {
            return { success: false, error: 'El terminal no pertenece a la ubicación solicitada' };
        }

        effectiveLocationId = terminalScope.locationId ?? effectiveLocationId;
    }

    if (params.sessionId) {
        const sessionScope = await ensureSessionInPosScope(params.sessionId, actor, db);
        if (!sessionScope.success) {
            return sessionScope;
        }

        session = sessionScope.session;
        if (params.terminalId && String(session.terminal_id || '') !== params.terminalId) {
            return { success: false, error: 'La sesión no corresponde al terminal solicitado' };
        }
        if (effectiveLocationId && sessionScope.locationId && effectiveLocationId !== sessionScope.locationId) {
            return { success: false, error: 'La sesión no pertenece a la ubicación solicitada' };
        }

        effectiveLocationId = sessionScope.locationId ?? effectiveLocationId;
    }

    const scopedLocation = resolveEffectivePosLocation(actor, effectiveLocationId);
    if (!scopedLocation.success) {
        return scopedLocation;
    }

    return {
        success: true,
        locationId: scopedLocation.locationId,
        terminal,
        session,
    };
}
