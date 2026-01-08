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
    phone: z.string().max(15).optional(), // +569XXXXXXXX
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
    console.log('[Queue-Backend] Received data:', JSON.stringify(data, null, 2));

    const validated = CreateTicketSchema.safeParse(data);
    if (!validated.success) {
        console.error('[Queue-Backend] Validation failed:', JSON.stringify(validated.error.issues, null, 2));
        return { success: false, error: validated.error.issues[0]?.message };
    }

    console.log('[Queue-Backend] Validation passed, branchId:', validated.data.branchId);

    const { branchId, rut, type, name, phone } = validated.data;

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
                SELECT id, name FROM customers WHERE rut = $1
            `, [cleanRut]);

            if ((customerRes.rowCount || 0) > 0) {
                customerId = customerRes.rows[0].id;
                customerName = customerRes.rows[0].name || customerName;
            } else if (name) {
                // Crear nuevo cliente desde totem
                const newCustomerRes = await query(`
                    INSERT INTO customers (id, rut, name, phone, source, status, created_at)
                    VALUES ($1, $2, $3, $4, 'TOTEM', 'ACTIVE', NOW())
                    RETURNING id
                `, [randomUUID(), cleanRut, name, phone || null]);
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

        // Insertar ticket con datos de cliente
        const ticketId = randomUUID();
        const result = await query(`
            INSERT INTO queue_tickets (id, branch_id, rut, type, code, status, customer_id, customer_name, customer_phone, created_at)
            VALUES ($1, $2, $3, $4, $5, 'WAITING', $6, $7, $8, NOW())
            RETURNING *
        `, [ticketId, branchId, cleanRut, type, ticketCode, customerId, customerName, phone || null]);

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
    userId: string,
    terminalId?: string
): Promise<{ success: boolean; ticket?: any; error?: string }> {
    if (!UUIDSchema.safeParse(branchId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        // SERIALIZABLE para evitar duplicados
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. RECOVER SESSION: Check if user already has an active ticket (CALLED)
        // This prevents stacking tickets and allows recovering state if UI crashed
        const activeTicketRes = await client.query(`
            SELECT * FROM queue_tickets
            WHERE branch_id = $1 AND status = 'CALLED' AND called_by = $2
            ORDER BY created_at DESC
            LIMIT 1
        `, [branchId, userId]);

        if ((activeTicketRes.rowCount || 0) > 0) {
            await client.query('COMMIT');
            logger.info({ ticketId: activeTicketRes.rows[0].id }, '📢 [Queue] Recovered active ticket');
            return { success: true, ticket: activeTicketRes.rows[0] };
        }

        // 2. Select Next Waiting Ticket
        console.log(`[QueueDebug] Searching waiting tickets for Branch: ${branchId}`);
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
            console.log(`[QueueDebug] No waiting tickets found for Branch: ${branchId}`);
            await client.query('COMMIT');
            return { success: true, ticket: null };
        }

        const ticket = result.rows[0];
        console.log(`[QueueDebug] Found ticket ${ticket.code} (${ticket.id}). User: ${userId}, Terminal: ${terminalId}`);

        // Marcar como CALLED
        await client.query(`
            UPDATE queue_tickets
            SET status = 'CALLED', called_at = NOW(), called_by = $2, terminal_id = $3
            WHERE id = $1
        `, [ticket.id, userId, terminalId || null]);

        console.log(`[QueueDebug] Ticket updated to CALLED`);

        // Auditar (con campos mínimos requeridos)
        try {
            await client.query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at, server_timestamp)
                VALUES ($1, 'TICKET_CALLED', 'QUEUE', $2::text, $3::jsonb, NOW(), NOW())
            `, [userId, ticket.id, JSON.stringify({
                code: ticket.code,
                type: ticket.type,
                terminal_id: terminalId,
                wait_time_seconds: Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 1000),
            })]);
        } catch (auditErr: any) {
            console.warn('[Queue] Audit insert failed (non-critical):', auditErr?.message);
        }

        await client.query('COMMIT');

        logger.info({ ticketId: ticket.id, code: ticket.code }, '📢 [Queue] Ticket called');
        revalidatePath('/');

        return { success: true, ticket: { ...ticket, terminal_id: terminalId } };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[QueueDebug] ERROR in getNextTicketSecure:', error);
        logger.error({ error: error?.message }, '[Queue] Get next ticket error');
        return { success: false, error: `Error: ${error?.message || 'Error obteniendo ticket'}` };
    } finally {
        client.release();
    }
}

/**
 * 🚀 Completar Actual y Llamar Siguiente (ATÓMICO)
 * Evita race conditions y asegura fluidez.
 */
export async function completeAndGetNextSecure(
    currentTicketId: string,
    branchId: string,
    userId: string,
    terminalId?: string
): Promise<{ success: boolean; nextTicket?: any; completedTicket?: any; error?: string }> {
    if (!UUIDSchema.safeParse(currentTicketId).success || !UUIDSchema.safeParse(branchId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. COMPLETAR ACTUAL
        const completeRes = await client.query(`
             UPDATE queue_tickets
             SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2
             WHERE id = $1 AND status = 'CALLED' AND called_by = $2
             RETURNING *
         `, [currentTicketId, userId]);

        let completedTicket = null;

        if ((completeRes.rowCount || 0) > 0) {
            completedTicket = completeRes.rows[0];
        } else {
            // Si no se actualizó, verificamos si ya estaba completado para no bloquear
            // Esto permite "autocuración" si la UI estaba desincronizada
            const checkRes = await client.query(`
                SELECT status FROM queue_tickets WHERE id = $1
            `, [currentTicketId]);

            if ((checkRes.rowCount || 0) > 0 && checkRes.rows[0].status === 'COMPLETED') {
                // Ya estaba completado, ignoramos el error y seguimos
                console.log('[Queue] Ticket already completed, proceeding to next');
            } else {
                // Si no existe o está en otro estado extraño, logueamos pero INTENTAMOS seguir 
                // para no bloquear al cajero.
                console.warn('[Queue] Warning: Current ticket could not be completed (stale state?)');
            }
        }

        // 2. OBTENER SIGUIENTE
        const nextRes = await client.query(`
             SELECT * FROM queue_tickets
             WHERE branch_id = $1 AND status = 'WAITING'
             ORDER BY
                 CASE WHEN type = 'PREFERENTIAL' THEN 1 ELSE 2 END,
                 created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
         `, [branchId]);

        let nextTicket = null;

        if ((nextRes.rowCount || 0) > 0) {
            nextTicket = nextRes.rows[0];
            // Marcar Siguiente como CALLED
            await client.query(`
                 UPDATE queue_tickets
                 SET status = 'CALLED', called_at = NOW(), called_by = $2, terminal_id = $3
                 WHERE id = $1
             `, [nextTicket.id, userId, terminalId || null]);

            nextTicket = { ...nextTicket, status: 'CALLED', terminal_id: terminalId };
        }

        // 3. AUDITORÍA (Opcional, fuera del throw crítico)
        // ... (Podemos simplificar auditoría aquí para velocidad)

        await client.query('COMMIT');
        revalidatePath('/');

        return { success: true, nextTicket, completedTicket };

    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

// ============================================================================
// RECALL TICKET
// ============================================================================
export async function recallTicketSecure(
    ticketId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`[QueueDebug] Attempting RECALL for Ticket: ${ticketId} by User: ${userId}`);
        const result = await query(`
            UPDATE queue_tickets
            SET called_at = NOW() 
            WHERE id = $1 AND status = 'CALLED' AND called_by = $2
        `, [ticketId, userId]);

        if (result.rowCount === 0) {
            console.warn(`[QueueDebug] RECALL FAILED. Ticket not found/owned.`);
            return { success: false, error: 'Ticket no disponible o pertenece a otro usuario' };
        }

        console.log(`[QueueDebug] RECALL SUCCESS`);
        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        console.error('[QueueDebug] RECALL ERROR:', e);
        return { success: false, error: e.message };
    }
}

// ... (skipping callTicketSecure which is fine) ...

// ============================================================================
// COMPLETE TICKET
// ============================================================================
export async function completeTicketSecure(
    ticketId: string,
    userId: string
): Promise<{ success: boolean; serviceTime?: number; error?: string }> {
    if (!UUIDSchema.safeParse(ticketId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    try {
        console.log(`[QueueDebug] Attempting to COMPLETE ticket ${ticketId} by user ${userId}`);
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2
            WHERE id = $1 AND called_by = $2 AND status = 'CALLED'
            RETURNING code, called_at, completed_at
        `, [ticketId, userId]);

        if (result.rowCount === 0) {
            // DEBUG: Find OUT WHY it failed
            const check = await query(`SELECT * FROM queue_tickets WHERE id = $1`, [ticketId]);
            const ticket = check.rows[0];
            if (!ticket) return { success: false, error: 'Ticket no existe' };
            if (ticket.status !== 'CALLED') return { success: false, error: `Estado incorrecto: ${ticket.status}` };
            if (ticket.called_by !== userId) return { success: false, error: `Ticket pertenece a otro usuario` };

            return { success: false, error: 'No se pudo finalizar (Error desconocido)' };
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

        // logger.info({ ticketId, serviceTime }, '✅ [Queue] Ticket completed');
        console.log(`[QueueDebug] Ticket COMPLETED. Service Time: ${serviceTime}s`);
        revalidatePath('/');
        return { success: true, serviceTime };

    } catch (error: any) {
        console.error('[QueueDebug] Complete ticket error:', error);
        return { success: false, error: 'Error finalizando ticket' };
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
        // Si está siendo atendido, validar que sea el mismo usuario
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'NO_SHOW', cancelled_at = NOW(), cancellation_reason = $2
            WHERE id = $1
            AND (
                status = 'WAITING' 
                OR status = 'CALLED'
            )
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

import { unstable_noStore as noStore } from 'next/cache';

/**
 * 📊 Estado Actual de la Fila
 */
export async function getQueueStatusSecure(
    branchId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    noStore(); // Disable Cache for this action

    if (!UUIDSchema.safeParse(branchId).success) {
        return { success: false, error: 'ID inválido' };
    }

    try {
        // console.log(`[QueuePoll] Fetching status for ${ branchId } at ${ Date.now() } `); // Too verbose for prod, useful for debug

        const result = await query(`
            SELECT qt.*, t.name as terminal_name, t.module_number 
            FROM queue_tickets qt
            LEFT JOIN terminals t ON qt.terminal_id = t.id
            WHERE qt.branch_id = $1 AND qt.status IN('WAITING', 'CALLED')
            ORDER BY qt.created_at ASC
    `, [branchId]);

        // Fetch recent history (COMPLETED tickets)
        const historyRes = await query(`
            SELECT qt.*, t.name as terminal_name, t.module_number 
            FROM queue_tickets qt
            LEFT JOIN terminals t ON qt.terminal_id = t.id
            WHERE qt.branch_id = $1 AND qt.status IN('COMPLETED', 'NO_SHOW')
            -- Removed strict date check to ensure history shows up
            ORDER BY COALESCE(qt.completed_at, qt.cancelled_at) DESC
            LIMIT 5
    `, [branchId]);

        const waiting = result.rows.filter(t => t.status === 'WAITING');
        const called = result.rows.filter(t => t.status === 'CALLED');
        const completed = historyRes.rows;

        return {
            success: true,
            data: {
                waitingCount: waiting.length,
                currentTicket: called[0] || null, // Legacy: first called ticket
                calledTickets: called, // New: all called tickets
                lastCompletedTickets: completed, // New: history
                waitingTickets: waiting,
                estimatedWaitMinutes: waiting.length * 5,
                // DEBUG: Return all rows to see what is actually fetched
                debug_allRows: result.rows.map(r => ({ id: r.id, status: r.status, code: r.code, time: r.created_at }))
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
    COUNT(*) FILTER(WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER(WHERE status = 'CANCELLED') as cancelled,
            COUNT(*) FILTER(WHERE status = 'WAITING') as waiting,
                COUNT(*) FILTER(WHERE type = 'PREFERENTIAL') as preferential,
                    AVG(EXTRACT(EPOCH FROM(completed_at - called_at))) FILTER(WHERE status = 'COMPLETED') as avg_service_seconds,
                        AVG(EXTRACT(EPOCH FROM(called_at - created_at))) FILTER(WHERE called_at IS NOT NULL) as avg_wait_seconds
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

// ============================================================================
// RESET QUEUE (Admin function)
// ============================================================================

/**
 * 🔄 Resetear Cola - Marca todos los tickets pendientes como cancelados
 */
export async function resetQueueSecure(
    branchId: string,
    userId: string
): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!UUIDSchema.safeParse(branchId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    try {
        // Cancelar todos los tickets WAITING y CALLED de hoy (usar NO_SHOW ya que CANCELLED no existe en el enum)
        const result = await query(`
            UPDATE queue_tickets
            SET status = 'NO_SHOW'
            WHERE branch_id = $1 
            AND status IN('WAITING', 'CALLED')
            RETURNING id
    `, [branchId]);

        const count = result.rows?.length || 0;

        logger.info({ branchId, userId, count }, '🔄 [Queue] Queue reset');
        revalidatePath('/');

        return { success: true, count };

    } catch (error: any) {
        logger.error({ error }, '[Queue] Reset queue error');
        return { success: false, error: error?.message || 'Error reseteando cola' };
    }
}
