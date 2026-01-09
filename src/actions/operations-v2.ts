'use server';

/**
 * ============================================================================
 * OPERATIONS-V2: Operaciones Seguras de Turnos y Asistencia
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES DE SEGURIDAD:
 * - SERIALIZABLE para marcajes (evitar doble clock)
 * - PIN MANAGER para abrir/cerrar turno
 * - Auditoría completa de asistencia
 * - Rate limit en generación de tickets
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const OpenShiftSchema = z.object({
    userId: UUIDSchema,
    locationId: UUIDSchema,
    managerPin: z.string().min(4, 'PIN requerido'),
});

const ClockSchema = z.object({
    userId: UUIDSchema,
    locationId: UUIDSchema,
    method: z.enum(['PIN', 'BIOMETRIC', 'MANUAL']).default('PIN'),
});

const TicketSchema = z.object({
    type: z.enum(['GENERAL', 'PREFERENCIAL', 'CAJA']),
    locationId: UUIDSchema,
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// Rate limiting para tickets (en memoria)
const ticketRateLimit = new Map<string, { count: number; resetAt: number }>();
const TICKET_RATE_LIMIT = { maxPerMinute: 30 };

// ============================================================================
// HELPERS
// ============================================================================

async function validateManagerPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(pin, user.access_pin_hash);
                if (valid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name } };
            }
        }
        return { valid: false, error: 'PIN de manager inválido' };
    } catch (error) {
        logger.error({ error }, '[Operations] PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

async function auditOperation(client: any, params: {
    userId: string;
    action: string;
    entityType: string;
    details: Record<string, any>;
}): Promise<void> {
    try {
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, $2, $3, $4::jsonb, NOW())
        `, [params.userId, params.action, params.entityType, JSON.stringify(params.details)]);
    } catch (error) {
        logger.warn({ error }, '[Operations] Audit failed');
    }
}

function checkTicketRateLimit(locationId: string): boolean {
    const now = Date.now();
    const key = `ticket:${locationId}`;
    const entry = ticketRateLimit.get(key);

    if (!entry || now > entry.resetAt) {
        ticketRateLimit.set(key, { count: 1, resetAt: now + 60000 });
        return true;
    }

    if (entry.count >= TICKET_RATE_LIMIT.maxPerMinute) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// GESTIÓN DE TURNOS
// ============================================================================

/**
 * 📊 Obtener Estado del Turno por Ubicación
 */
export async function getShiftStatusSecure(
    locationId: string
): Promise<{ success: boolean; isOpen?: boolean; openedBy?: string; openedAt?: Date; error?: string }> {
    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    try {
        const res = await query(`
            SELECT is_open, opened_by, opened_at
            FROM shift_status
            WHERE location_id = $1
        `, [locationId]);

        if (res.rows.length === 0) {
            return { success: true, isOpen: false };
        }

        const shift = res.rows[0];
        return {
            success: true,
            isOpen: shift.is_open,
            openedBy: shift.opened_by,
            openedAt: shift.opened_at,
        };
    } catch (error: any) {
        // Si la tabla no existe, retornar cerrado
        if (error.code === '42P01') {
            return { success: true, isOpen: false };
        }
        logger.error({ error }, '[Operations] Get shift status error');
        return { success: false, error: 'Error obteniendo estado del turno' };
    }
}

/**
 * 🟢 Abrir Turno (Requiere PIN MANAGER)
 */
export async function openShiftSecure(
    data: z.infer<typeof OpenShiftSchema>
): Promise<{ success: boolean; error?: string; autoCheckInTriggered?: boolean }> {
    const validated = OpenShiftSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { userId, locationId, managerPin } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validar PIN
        const authResult = await validateManagerPin(client, managerPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error };
        }

        // Verificar si ya está abierto
        const currentRes = await client.query(`
            SELECT is_open FROM shift_status WHERE location_id = $1 FOR UPDATE
        `, [locationId]);

        if (currentRes.rows.length > 0 && currentRes.rows[0].is_open) {
            await client.query('ROLLBACK');
            return { success: false, error: 'El turno ya está abierto' };
        }

        // Abrir turno
        await client.query(`
            INSERT INTO shift_status (location_id, is_open, opened_by, opened_at)
            VALUES ($1, true, $2, NOW())
            ON CONFLICT (location_id) 
            DO UPDATE SET is_open = true, opened_by = $2, opened_at = NOW(), closed_by = NULL, closed_at = NULL
        `, [locationId, authResult.manager!.id]);

        // Auditar
        await auditOperation(client, {
            userId: authResult.manager!.id,
            action: 'SHIFT_OPENED',
            entityType: 'SHIFT',
            details: { location_id: locationId, opened_by: authResult.manager!.name },
        });

        await client.query('COMMIT');

        logger.info({ locationId, managerId: authResult.manager!.id }, '🟢 [Operations] Shift opened');
        revalidatePath('/');

        // 🤖 AUTO-CHECK-IN: Si abrió turno, está trabajando.
        const { ensureCheckInSecure } = await import('@/actions/attendance-v2');
        const autoCheckInTriggered = await ensureCheckInSecure(authResult.manager!.id, locationId);

        return { success: true, autoCheckInTriggered };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Operations] Open shift error');
        return { success: false, error: 'Error abriendo turno' };
    } finally {
        client.release();
    }
}

/**
 * 🔴 Cerrar Turno (Requiere PIN MANAGER)
 */
export async function closeShiftSecure(
    userId: string,
    locationId: string,
    managerPin: string
): Promise<{ success: boolean; error?: string }> {
    const validated = OpenShiftSchema.safeParse({ userId, locationId, managerPin });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validar PIN
        const authResult = await validateManagerPin(client, managerPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error };
        }

        // Cerrar turno
        const result = await client.query(`
            UPDATE shift_status 
            SET is_open = false, closed_by = $2, closed_at = NOW()
            WHERE location_id = $1 AND is_open = true
        `, [locationId, authResult.manager!.id]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay turno abierto para cerrar' };
        }

        await auditOperation(client, {
            userId: authResult.manager!.id,
            action: 'SHIFT_CLOSED',
            entityType: 'SHIFT',
            details: { location_id: locationId, closed_by: authResult.manager!.name },
        });

        await client.query('COMMIT');

        logger.info({ locationId }, '🔴 [Operations] Shift closed');
        revalidatePath('/');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Operations] Close shift error');
        return { success: false, error: 'Error cerrando turno' };
    } finally {
        client.release();
    }
}

// ============================================================================
// MARCAJE DE ASISTENCIA
// ============================================================================

/**
 * 🕐 Clock In Seguro (SERIALIZABLE)
 */
export async function clockInSecure(
    data: z.infer<typeof ClockSchema>
): Promise<{ success: boolean; attendanceId?: string; error?: string }> {
    const validated = ClockSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { userId, locationId, method } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verificar que no tenga entrada activa hoy
        const checkRes = await client.query(`
            SELECT id FROM attendance_logs 
            WHERE user_id = $1 
            AND DATE(timestamp) = CURRENT_DATE 
            AND type = 'CHECK_IN'
            AND NOT EXISTS (
                SELECT 1 FROM attendance_logs al2 
                WHERE al2.user_id = $1 
                AND DATE(al2.timestamp) = CURRENT_DATE 
                AND al2.type = 'CHECK_OUT'
            )
        `, [userId]);

        if (checkRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ya tiene una entrada activa hoy' };
        }

        // Registrar entrada
        const attendanceId = randomUUID();
        await client.query(`
            INSERT INTO attendance_logs (id, user_id, type, location_id, method, timestamp)
            VALUES ($1, $2, 'CHECK_IN', $3, $4, NOW())
        `, [attendanceId, userId, locationId, method]);

        await auditOperation(client, {
            userId,
            action: 'CLOCK_IN',
            entityType: 'ATTENDANCE',
            details: { location_id: locationId, method },
        });

        await client.query('COMMIT');

        logger.info({ userId, locationId }, '🕐 [Operations] Clock in');
        revalidatePath('/');
        return { success: true, attendanceId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Operations] Clock in error');
        return { success: false, error: 'Error registrando entrada' };
    } finally {
        client.release();
    }
}

/**
 * 🕐 Clock Out Seguro (SERIALIZABLE)
 */
export async function clockOutSecure(
    userId: string,
    locationId: string
): Promise<{ success: boolean; hoursWorked?: number; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success || !UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Buscar entrada activa
        const checkInRes = await client.query(`
            SELECT id, timestamp FROM attendance_logs 
            WHERE user_id = $1 
            AND DATE(timestamp) = CURRENT_DATE 
            AND type = 'CHECK_IN'
            ORDER BY timestamp DESC
            LIMIT 1
        `, [userId]);

        if (checkInRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No tiene entrada activa para marcar salida' };
        }

        const checkInTime = new Date(checkInRes.rows[0].timestamp);
        const checkOutTime = new Date();
        const hoursWorked = (checkOutTime.getTime() - checkInTime.getTime()) / 3600000;

        // Registrar salida
        const attendanceId = randomUUID();
        await client.query(`
            INSERT INTO attendance_logs (id, user_id, type, location_id, method, timestamp, hours_worked)
            VALUES ($1, $2, 'CHECK_OUT', $3, 'PIN', NOW(), $4)
        `, [attendanceId, userId, locationId, hoursWorked]);

        await auditOperation(client, {
            userId,
            action: 'CLOCK_OUT',
            entityType: 'ATTENDANCE',
            details: { location_id: locationId, hours_worked: hoursWorked.toFixed(2) },
        });

        await client.query('COMMIT');

        logger.info({ userId, hoursWorked: hoursWorked.toFixed(2) }, '🕐 [Operations] Clock out');
        revalidatePath('/');
        return { success: true, hoursWorked: Math.round(hoursWorked * 100) / 100 };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Operations] Clock out error');
        return { success: false, error: 'Error registrando salida' };
    } finally {
        client.release();
    }
}

// ============================================================================
// SISTEMA DE FILAS (TOTEM)
// ============================================================================

/**
 * 🎫 Generar Ticket (con Rate Limiting)
 */
export async function generateTicketSecure(
    type: 'GENERAL' | 'PREFERENCIAL' | 'CAJA',
    locationId: string
): Promise<{ success: boolean; ticket?: { id: string; number: string }; error?: string }> {
    const validated = TicketSchema.safeParse({ type, locationId });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    // Rate limit check
    if (!checkTicketRateLimit(locationId)) {
        return { success: false, error: 'Demasiados tickets generados. Espere un momento.' };
    }

    try {
        // Obtener número actual
        const countRes = await query(`
            SELECT COUNT(*) as count FROM queue_tickets 
            WHERE DATE(created_at) = CURRENT_DATE AND location_id = $1
        `, [locationId]);

        const nextNum = parseInt(countRes.rows[0].count || '0') + 1;
        const prefix = type === 'PREFERENCIAL' ? 'P' : type === 'CAJA' ? 'C' : 'A';
        const ticketNumber = `${prefix}-${nextNum.toString().padStart(3, '0')}`;

        const ticketId = randomUUID();
        await query(`
            INSERT INTO queue_tickets (id, ticket_number, type, location_id, status, created_at)
            VALUES ($1, $2, $3, $4, 'WAITING', NOW())
        `, [ticketId, ticketNumber, type, locationId]);

        logger.info({ ticketNumber, locationId }, '🎫 [Operations] Ticket generated');
        revalidatePath('/totem');

        return {
            success: true,
            ticket: { id: ticketId, number: ticketNumber },
        };

    } catch (error: any) {
        logger.error({ error }, '[Operations] Generate ticket error');
        return { success: false, error: 'Error generando ticket' };
    }
}

/**
 * 📢 Llamar Siguiente Ticket
 */
export async function callNextTicketSecure(
    counterId: number,
    userId: string
): Promise<{ success: boolean; ticket?: { id: string; number: string }; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Buscar ticket más antiguo en espera
        const findRes = await client.query(`
            SELECT id, ticket_number FROM queue_tickets 
            WHERE status = 'WAITING'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);

        if (findRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay clientes en espera' };
        }

        const ticket = findRes.rows[0];

        // Actualizar estado
        await client.query(`
            UPDATE queue_tickets 
            SET status = 'CALLING', counter_id = $1, called_at = NOW(), called_by = $3
            WHERE id = $2
        `, [counterId, ticket.id, userId]);

        await auditOperation(client, {
            userId,
            action: 'TICKET_CALLED',
            entityType: 'QUEUE',
            details: { ticket_number: ticket.ticket_number, counter: counterId },
        });

        await client.query('COMMIT');

        logger.info({ ticketNumber: ticket.ticket_number, counter: counterId }, '📢 [Operations] Ticket called');
        revalidatePath('/');

        return {
            success: true,
            ticket: { id: ticket.id, number: ticket.ticket_number },
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Operations] Call ticket error');
        return { success: false, error: 'Error llamando ticket' };
    } finally {
        client.release();
    }
}
