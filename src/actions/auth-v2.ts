'use server';

import * as Sentry from '@sentry/nextjs';
import { query } from '@/lib/db';
import { classifyPgError } from '@/lib/db-errors';
import { createCorrelationId, type ActionFailure } from '@/lib/action-response';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';

export interface AuthenticatedUser {
    id: string;
    name: string;
    role: string;
    assigned_location_id?: string | null;
}

export type AuthActionResult =
    | { success: true; user: AuthenticatedUser }
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

export async function getSessionSecure() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const role = cookieStore.get('user_role')?.value;
    const locationId = cookieStore.get('user_location')?.value;
    const userName = cookieStore.get('user_name')?.value;

    if (!userId || !role) {
        return null;
    }

    return { userId, role, locationId, userName: userName || 'Usuario' };
}

export async function verifyUserPin(userId: string, pin: string) {
    try {
        if (!userId || !pin) return { success: false, error: 'Datos incompletos' };

        const res = await query('SELECT role, access_pin FROM users WHERE id = $1', [userId]);

        if ((res.rowCount ?? 0) === 0) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        const userData = res.rows[0];

        const allowedRoles = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
        if (!allowedRoles.includes(userData.role)) {
            return { success: false, error: 'Sin permisos suficientes' };
        }

        if (userData.access_pin === pin) {
            return { success: true };
        }

        return { success: false, error: 'PIN Incorrecto' };
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
export async function validateSupervisorPin(pin: string, requiredRoles: string[] = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL']) {
    try {
        const res = await query(`
            SELECT id, name, role, access_pin
            FROM users
            WHERE role = ANY($1::text[])
            AND access_pin = $2
            AND is_active = true
            LIMIT 1
        `, [requiredRoles, pin]);

        if ((res.rowCount ?? 0) > 0) {
            const user = res.rows[0];
            return {
                success: true,
                authorizedBy: { id: user.id, name: user.name, role: user.role }
            };
        }

        return { success: false, error: 'PIN inválido o sin permisos' };
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
            SELECT id, name, role, access_pin, assigned_location_id, is_active
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

        if (user.access_pin !== pin) {
            return authFailure({
                code: 'AUTH_INVALID_PIN',
                userMessage: 'PIN incorrecto',
                retryable: false,
            });
        }

        const cookieStore = await cookies();

        cookieStore.set('user_id', user.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        cookieStore.set('user_role', user.role, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        cookieStore.set('user_name', user.name, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

        const targetLocationId = locationId || user.assigned_location_id;
        if (targetLocationId) {
            cookieStore.set('user_location', targetLocationId, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        }

        return {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                assigned_location_id: user.assigned_location_id
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
