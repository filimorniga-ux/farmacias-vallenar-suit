import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hasGlobalPosScope, POS_ALLOWED_ROLES } from '@/actions/pos-scope';
import { normalizeRole } from '@/lib/pin-rbac';
import { getValidatedSession } from '@/lib/server-session';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';

const ValidateTerminalSessionSchema = z.object({
    sessionId: z.string().trim().min(1).max(120),
    terminalId: z.string().trim().min(1).max(120),
});

const POS_VALIDATE_ROLES = new Set(POS_ALLOWED_ROLES);

function invalidTerminalSessionResponse() {
    return NextResponse.json({
        success: true,
        valid: false,
        error: 'Sesión inválida'
    }, { headers: API_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
    try {
        const session = await getValidatedSession();
        if (!session) {
            return NextResponse.json(
                { success: false, error: 'No autorizado', code: 'AUTH_UNAUTHORIZED' },
                { status: 401, headers: API_NO_STORE_HEADERS },
            );
        }

        const actorRole = normalizeRole(session.role);
        if (!POS_VALIDATE_ROLES.has(actorRole as (typeof POS_ALLOWED_ROLES)[number])) {
            return NextResponse.json(
                { success: false, error: 'Acceso denegado', code: 'AUTH_FORBIDDEN' },
                { status: 403, headers: API_NO_STORE_HEADERS },
            );
        }

        const body = await request.json().catch(() => null);
        const parsed = ValidateTerminalSessionSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'sessionId y terminalId requeridos', code: 'INVALID_TERMINAL_SESSION_PAYLOAD' },
                { status: 400, headers: API_NO_STORE_HEADERS },
            );
        }

        const { sessionId, terminalId } = parsed.data;

        // Verificar que la sesión existe y está activa
        const result = await query(`
            SELECT 
                s.id,
                s.status,
                s.opened_at,
                s.user_id::text AS user_id,
                t.location_id::text AS location_id,
                t.status AS terminal_status
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1 AND s.terminal_id = $2
        `, [sessionId, terminalId]);

        if (result.rows.length === 0) {
            return invalidTerminalSessionResponse();
        }

        const terminalSession = result.rows[0];
        const terminalLocationId = String(terminalSession.location_id || '');
        const actorLocationId = session.locationId ? String(session.locationId) : '';

        if (!hasGlobalPosScope(actorRole)) {
            if (!terminalLocationId || !actorLocationId || terminalLocationId !== actorLocationId) {
                logger.warn(
                    { actorUserId: session.userId, actorRole, terminalId },
                    '[ValidateTerminalSessionRoute] Terminal session outside actor scope'
                );
                return invalidTerminalSessionResponse();
            }

            if (String(terminalSession.user_id || '') !== session.userId) {
                logger.warn(
                    { actorUserId: session.userId, actorRole, terminalId },
                    '[ValidateTerminalSessionRoute] Terminal session owned by another user'
                );
                return invalidTerminalSessionResponse();
            }
        }

        // Validar que esté activa
        if (terminalSession.status !== 'OPEN' || terminalSession.terminal_status !== 'OPEN') {
            return invalidTerminalSessionResponse();
        }

        // Validar que no sea muy antigua (>24h)
        // Ensure opened_at is treated as Date. 
        // Postgres returns Date object in node-postgres usually.
        const openedAt = new Date(terminalSession.opened_at);
        const now = new Date();
        if (Number.isNaN(openedAt.getTime()) || openedAt.getTime() > now.getTime()) {
            return invalidTerminalSessionResponse();
        }

        const hoursSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceOpen > 24) {
            return invalidTerminalSessionResponse();
        }

        return NextResponse.json({
            success: true,
            valid: true
        }, { headers: API_NO_STORE_HEADERS });

    } catch (error) {
        logger.error({ error }, '[ValidateTerminalSessionRoute] Session validation failed');
        return NextResponse.json(
            { success: false, error: 'No fue posible validar la sesión de terminal', code: 'TERMINAL_SESSION_VALIDATION_FAILED' },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    }
}
