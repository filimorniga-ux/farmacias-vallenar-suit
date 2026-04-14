'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';
import {
    issueKioskSessionToken,
    verifyKioskSessionToken,
    type KioskSessionMode,
} from '@/lib/kiosk-session';

type AdminKioskMode = KioskSessionMode | 'QUEUE' | 'QUEUE_DISPLAY';

const kioskQueryClient = {
    query: (sql: string, params?: unknown[]) => query(sql, params as never[] | undefined),
};

const QUEUE_ADMIN_ROLES = ROLE_GROUPS.MANAGER;

function getAllowedRoles(mode: AdminKioskMode) {
    if (mode === 'ATTENDANCE') {
        return ROLE_GROUPS.MANAGER_OR_HR;
    }

    return QUEUE_ADMIN_ROLES;
}

function hasGlobalModeScope(role: string, mode: AdminKioskMode) {
    const normalizedRole = String(role || '').toUpperCase();

    if (mode === 'ATTENDANCE') {
        return ['ADMIN', 'GERENTE_GENERAL', 'RRHH'].includes(normalizedRole);
    }

    return ['ADMIN', 'GERENTE_GENERAL'].includes(normalizedRole);
}

async function loadAuthorizedUser(userId: string) {
    const result = await query(
        `
            SELECT id, name, role, assigned_location_id, is_active
            FROM users
            WHERE id = $1
            LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}

async function ensureLocationExists(locationId: string) {
    const result = await query(
        `
            SELECT id
            FROM locations
            WHERE id = $1
            LIMIT 1
        `,
        [locationId]
    );

    return (result.rowCount || 0) > 0;
}

async function authorizeKioskAdmin(input: {
    mode: AdminKioskMode;
    locationId: string;
    pin: string;
}) {
    const locationExists = await ensureLocationExists(input.locationId);
    if (!locationExists) {
        return {
            success: false as const,
            error: 'Sucursal inválida para el kiosko',
        };
    }

    const validation = await validatePinForRoles(
        kioskQueryClient,
        input.pin,
        getAllowedRoles(input.mode),
        {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        }
    );

    if (!validation.valid) {
        return {
            success: false as const,
            error: validation.error || 'PIN no autorizado',
        };
    }

    const authorizedUser = await loadAuthorizedUser(validation.authorizedBy.id);
    if (!authorizedUser || authorizedUser.is_active === false) {
        return {
            success: false as const,
            error: 'Usuario autorizado no disponible',
        };
    }

    const role = String(authorizedUser.role || '').toUpperCase();
    const assignedLocationId = authorizedUser.assigned_location_id || null;

    if (!hasGlobalModeScope(role, input.mode) && assignedLocationId !== input.locationId) {
        return {
            success: false as const,
            error: 'El PIN autorizado no tiene acceso a esta sucursal',
        };
    }

    return {
        success: true as const,
        user: {
            id: authorizedUser.id as string,
            name: authorizedUser.name as string,
            role,
            assignedLocationId: assignedLocationId as string | null,
        },
    };
}

export async function unlockAttendanceKioskSecure(input: {
    locationId: string;
    pin: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
        const authorization = await authorizeKioskAdmin({
            mode: 'ATTENDANCE',
            locationId: input.locationId,
            pin: input.pin,
        });

        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }

        return {
            success: true,
            token: issueKioskSessionToken({
                mode: 'ATTENDANCE',
                locationId: input.locationId,
                authorizedBy: authorization.user.id,
            }),
        };
    } catch (error) {
        logger.error({ error, locationId: input.locationId }, '[Kiosk] Attendance unlock failed');
        return { success: false, error: 'No fue posible activar el kiosko' };
    }
}

export async function validateAttendanceKioskExitPinSecure(input: {
    pin: string;
    kioskToken: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const tokenResult = verifyKioskSessionToken(input.kioskToken, 'ATTENDANCE');
        if (!tokenResult.valid) {
            return { success: false, error: tokenResult.error };
        }

        const authorization = await authorizeKioskAdmin({
            mode: 'ATTENDANCE',
            locationId: tokenResult.payload.locationId,
            pin: input.pin,
        });

        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }

        return { success: true };
    } catch (error) {
        logger.error({ error }, '[Kiosk] Attendance exit validation failed');
        return { success: false, error: 'No fue posible validar la salida del kiosko' };
    }
}

export async function validatePublicKioskAdminPinSecure(input: {
    mode: 'QUEUE' | 'QUEUE_DISPLAY';
    locationId: string;
    pin: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const authorization = await authorizeKioskAdmin(input);
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }

        return { success: true };
    } catch (error) {
        logger.error({ error, mode: input.mode, locationId: input.locationId }, '[Kiosk] Public admin validation failed');
        return { success: false, error: 'No fue posible validar el PIN de administración' };
    }
}
