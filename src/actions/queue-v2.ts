'use server';

/**
 * ============================================================================
 * QUEUE-V2: Sistema de Filas Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limit: max 5 tickets por RUT por día
 * - SERIALIZABLE para getNextTicket
 * - Validación de RUT chileno
 * - Auditoría de tiempos de atención
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
const TicketType = z.enum(['GENERAL', 'PREFERENTIAL']);

// Validación de RUT chileno
const RutSchema = z.string()
    .regex(/^[0-9]{1,2}\.[0-9]{3}\.[0-9]{3}-[0-9Kk]$|^[0-9]{7,8}-[0-9Kk]$|^ANON$/, 'RUT inválido')
    .transform(rut => rut === 'ANON' ? 'ANON' : rut.replace(/\./g, '').toUpperCase());

const CreateTicketSchema = z.object({
    branchId: UUIDSchema,
    rut: z.string().default('ANON'),
    type: TicketType.default('GENERAL'),
    name: z.string().max(100).optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_TICKETS_PER_RUT_PER_DAY = 5;

// Rate limiting en memoria
const ticketRateLimit = new Map<string, { count: number; date: string }>();

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Validar RUT chileno (dígito verificador)
 */
function validateRutCheckDigit(rut: string): boolean {
    if (rut === 'ANON') return true;

    const cleanRut = rut.replace(/[.-]/g, '').toUpperCase();
    const body = cleanRut.slice(0, -1);
    const dv = cleanRut.slice(-1);

    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDv = 11 - (sum % 11);
    const calculatedDv = expectedDv === 11 ? '0' : expectedDv === 10 ? 'K' : expectedDv.toString();

    return dv === calculatedDv;
}

/**
 * Verificar rate limit por RUT
 */
function checkRutRateLimit(rut: string): boolean {
    if (rut === 'ANON') return true;

    const today = new Date().toISOString().slice(0, 10);
    const key = `ticket:${rut}`;
    const entry = ticketRateLimit.get(key);

    if (!entry || entry.date !== today) {
        ticketRateLimit.set(key, { count: 1, date: today });
        return true;
    }

    if (entry.count >= MAX_TICKETS_PER_RUT_PER_DAY) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// CREATE TICKET
// ============================================================================

/**
 * 🎫 Crear Ticket Seguro
 * - Rate limit por RUT
 * - Validación de RUT chileno
 */
export async function createTicketSecure(
    data: z.infer<typeof CreateTicketSchema>
): Promise<{ success: boolean; ticket?: any; error?: string }> {
    const validated = CreateTicketSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { branchId, rut, type, name } = validated.data;

    // Validar RUT si no es anónimo
    const cleanRut = rut !== 'ANON' ? rut.replace(/\./g, '').toUpperCase() : 'ANON';

    if (cleanRut !== 'ANON') {
        if (!validateRutCheckDigit(cleanRut)) {
            return { success: false, error: 'RUT inválido (dígito verificador incorrecto)' };
        }

        // Rate limit
        if (!checkRutRateLimit(cleanRut)) {
            return {
                success: false,
                error: `Máximo ${MAX_TICKETS_PER_RUT_PER_DAY} tickets por día por RUT`,
            };
        }
    }

    try {
        let customerId = null;
        let customerName = name || 'Anónimo';

        // Buscar/crear cliente si tiene RUT
        if (cleanRut !== 'ANON') {
            const customerRes = await query(`
                SELECT id, full_name, name FROM customers WHERE rut = $1
            `, [cleanRut]);

            if ((customerRes.rowCount || 0) > 0) {
                customerId = customerRes.rows[0].id;
                customerName = customerRes.rows[0].full_name || customerRes.rows[0].name || customerName;
            } else if (name) {
                const newCustomerRes = await query(`
                    INSERT INTO customers (id, rut, full_name, name, total_points, registration_source, status, created_at)
                    VALUES ($1, $2, $3, $4, 0, 'KIOSK', 'ACTIVE', NOW())
                    RETURNING id
                `, [randomUUID(), cleanRut, name, name]);
                customerId = newCustomerRes.rows[0].id;
            }
        }

        // Generar código de ticket
        const countRes = await query(`
            SELECT COUNT(*) as count FROM queue_tickets
            WHERE branch_id = $1 AND DATE(created_at) = CURRENT_DATE
        `, [branchId]);

        const count = parseInt(countRes.rows[0]?.count || '0') + 1;
        const prefix = type === 'PREFERENTIAL' ? 'P' : 'G';
        const ticketCode = `${prefix}${count.toString().padStart(3, '0')}`;

        // Insertar ticket
        const ticketId = randomUUID();
        const result = await query(`
            INSERT INTO queue_tickets (id, branch_id, rut, type, code, status, customer_id, created_at)
            VALUES ($1, $2, $3, $4, $5, 'WAITING', $6, NOW())
            RETURNING *
        `, [ticketId, branchId, cleanRut, type, ticketCode, customerId]);

        logger.info({ ticketId, code: ticketCode, branchId }, '🎫 [Queue] Ticket created');
        revalidatePath('/totem');

        return {
            success: true,
            ticket: { ...result.rows[0], customerName },
        };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Create ticket error');
        return { success: false, error: 'Error creando ticket' };
    }
}

// ============================================================================
// GET NEXT TICKET
// ============================================================================

/**
 * 📢 Obtener Siguiente Ticket (SERIALIZABLE)
 */
export async function getNextTicketSecure(
    branchId: string,
    userId: string
): Promise<{ success: boolean; ticket?: any; error?: string }> {
    if (!UUIDSchema.safeParse(branchId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        // SERIALIZABLE para evitar duplicados
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Buscar siguiente con prioridad y bloqueo
        const result = await client.query(`
            SELECT * FROM queue_tickets
            WHERE branch_id = $1 AND status = 'WAITING'
            ORDER BY
                CASE WHEN type = 'PREFERENTIAL' THEN 1 ELSE 2 END,
                created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `, [branchId]);

        if (result.rowCount === 0) {
            await client.query('COMMIT');
            return { success: true, ticket: null };
        }

        const ticket = result.rows[0];

        // Marcar como CALLED
        await client.query(`
            UPDATE queue_tickets
            SET status = 'CALLED', called_at = NOW(), called_by = $2
            WHERE id = $1
        `, [ticket.id, userId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'TICKET_CALLED', 'QUEUE', $2, $3::jsonb, NOW())
        `, [userId, ticket.id, JSON.stringify({
            code: ticket.code,
            type: ticket.type,
            wait_time_seconds: Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 1000),
        })]);

        await client.query('COMMIT');

        logger.info({ ticketId: ticket.id, code: ticket.code }, '📢 [Queue] Ticket called');
        revalidatePath('/');

        return { success: true, ticket };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Queue] Get next ticket error');
        return { success: false, error: 'Error obteniendo ticket' };
    } finally {
        client.release();
    }
}

// ============================================================================
// CALL SPECIFIC TICKET
// ============================================================================

/**
 * 📣 Llamar Ticket Específico
 */
export async function callTicketSecure(
    ticketId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(ticketId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    try {
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'CALLED', called_at = NOW(), called_by = $2
            WHERE id = $1 AND status = 'WAITING'
            RETURNING code
        `, [ticketId, userId]);

        if (result.rowCount === 0) {
            return { success: false, error: 'Ticket no encontrado o ya procesado' };
        }

        logger.info({ ticketId }, '📣 [Queue] Ticket called directly');
        revalidatePath('/');
        return { success: true };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Call ticket error');
        return { success: false, error: 'Error llamando ticket' };
    }
}

// ============================================================================
// COMPLETE TICKET
// ============================================================================

/**
 * ✅ Completar Atención
 */
export async function completeTicketSecure(
    ticketId: string,
    userId: string
): Promise<{ success: boolean; serviceTime?: number; error?: string }> {
    if (!UUIDSchema.safeParse(ticketId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    try {
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2
            WHERE id = $1 AND status = 'CALLED'
            RETURNING code, called_at, completed_at
        `, [ticketId, userId]);

        if (result.rowCount === 0) {
            return { success: false, error: 'Ticket no encontrado o no está en atención' };
        }

        const ticket = result.rows[0];
        const serviceTime = Math.floor(
            (new Date(ticket.completed_at).getTime() - new Date(ticket.called_at).getTime()) / 1000
        );

        // Auditar tiempo de atención
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'TICKET_COMPLETED', 'QUEUE', $2, $3::jsonb, NOW())
        `, [userId, ticketId, JSON.stringify({
            code: ticket.code,
            service_time_seconds: serviceTime,
        })]);

        logger.info({ ticketId, serviceTime }, '✅ [Queue] Ticket completed');
        revalidatePath('/');
        return { success: true, serviceTime };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Complete ticket error');
        return { success: false, error: 'Error completando ticket' };
    }
}

// ============================================================================
// CANCEL TICKET
// ============================================================================

/**
 * ❌ Cancelar Ticket
 */
export async function cancelTicketSecure(
    ticketId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(ticketId).success) {
        return { success: false, error: 'ID inválido' };
    }

    if (!reason || reason.length < 5) {
        return { success: false, error: 'Razón requerida (mínimo 5 caracteres)' };
    }

    try {
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $2
            WHERE id = $1 AND status IN ('WAITING', 'CALLED')
            RETURNING code
        `, [ticketId, reason]);

        if (result.rowCount === 0) {
            return { success: false, error: 'Ticket no encontrado o ya procesado' };
        }

        logger.info({ ticketId, reason }, '❌ [Queue] Ticket cancelled');
        revalidatePath('/');
        return { success: true };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Cancel ticket error');
        return { success: false, error: 'Error cancelando ticket' };
    }
}

// ============================================================================
// QUEUE STATUS
// ============================================================================

/**
 * 📊 Estado Actual de la Fila
 */
export async function getQueueStatusSecure(
    branchId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!UUIDSchema.safeParse(branchId).success) {
        return { success: false, error: 'ID inválido' };
    }

    try {
        const result = await query(`
            SELECT * FROM queue_tickets
            WHERE branch_id = $1 AND status IN ('WAITING', 'CALLED')
            ORDER BY created_at ASC
        `, [branchId]);

        const waiting = result.rows.filter(t => t.status === 'WAITING');
        const current = result.rows.find(t => t.status === 'CALLED');

        return {
            success: true,
            data: {
                waitingCount: waiting.length,
                currentTicket: current || null,
                waitingTickets: waiting,
                estimatedWaitMinutes: waiting.length * 5, // Estimado 5 min por ticket
            },
        };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Get status error');
        return { success: false, error: 'Error obteniendo estado' };
    }
}

// ============================================================================
// QUEUE METRICS
// ============================================================================

/**
 * 📈 Métricas del Día
 */
export async function getQueueMetrics(
    branchId: string,
    date?: Date
): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!UUIDSchema.safeParse(branchId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const targetDate = date || new Date();

    try {
        const result = await query(`
            SELECT
                COUNT(*) as total_tickets,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
                COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
                COUNT(*) FILTER (WHERE status = 'WAITING') as waiting,
                COUNT(*) FILTER (WHERE type = 'PREFERENTIAL') as preferential,
                AVG(EXTRACT(EPOCH FROM (completed_at - called_at))) FILTER (WHERE status = 'COMPLETED') as avg_service_seconds,
                AVG(EXTRACT(EPOCH FROM (called_at - created_at))) FILTER (WHERE called_at IS NOT NULL) as avg_wait_seconds
            FROM queue_tickets
            WHERE branch_id = $1 AND DATE(created_at) = DATE($2)
        `, [branchId, targetDate]);

        const metrics = result.rows[0];

        return {
            success: true,
            data: {
                totalTickets: parseInt(metrics.total_tickets) || 0,
                completed: parseInt(metrics.completed) || 0,
                cancelled: parseInt(metrics.cancelled) || 0,
                waiting: parseInt(metrics.waiting) || 0,
                preferential: parseInt(metrics.preferential) || 0,
                avgServiceSeconds: Math.round(parseFloat(metrics.avg_service_seconds) || 0),
                avgWaitSeconds: Math.round(parseFloat(metrics.avg_wait_seconds) || 0),
            },
        };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Get metrics error');
        return { success: false, error: 'Error obteniendo métricas' };
    }
}
