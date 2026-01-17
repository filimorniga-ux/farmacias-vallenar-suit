'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const HistoryFilterSchema = z.object({
    locationId: z.string().uuid().optional(),
    limit: z.number().min(1).max(100).default(50),
    startDate: z.number().optional(), // Timestamp
    endDate: z.number().optional(), // Timestamp
    terminalId: z.string().uuid().optional(),
    status: z.enum(['OPEN', 'CLOSED', 'CLOSED_FORCE', 'CLOSED_AUTO']).optional(),
});

export async function getShiftHistory(filters: z.infer<typeof HistoryFilterSchema>) {
    try {
        const validation = HistoryFilterSchema.safeParse(filters);
        if (!validation.success) {
            return { success: false, error: 'Filtros inválidos' };
        }

        const { locationId, limit, startDate, endDate, terminalId, status } = validation.data;

        // Construcción dinámica de la query
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        // Base query con JOINs para obtener nombres descriptivos
        let sql = `
            SELECT 
                s.id,
                s.terminal_id,
                t.name as terminal_name,
                s.user_id,
                u.name as user_name,
                s.opened_at,
                s.closed_at,
                s.closing_amount,
                s.cash_difference as difference,
                s.status,
                s.notes,
                s.authorized_by,
                au.name as authorized_by_name,
                t.location_id
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id::text = u.id
            LEFT JOIN users au ON s.authorized_by::text = au.id
            WHERE 1=1
        `;

        if (locationId) {
            conditions.push(`t.location_id = $${paramIndex++}`);
            params.push(locationId);
        }

        if (terminalId) {
            conditions.push(`s.terminal_id = $${paramIndex++}`);
            params.push(terminalId);
        }

        if (status) {
            conditions.push(`s.status = $${paramIndex++}`);
            params.push(status);
        }

        if (startDate) {
            conditions.push(`s.opened_at >= to_timestamp($${paramIndex++} / 1000.0)`);
            params.push(startDate);
        }

        if (endDate) {
            conditions.push(`s.opened_at <= to_timestamp($${paramIndex++} / 1000.0)`);
            params.push(endDate);
        }

        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }

        // Ordenamiento y Límite
        sql += ` ORDER BY s.opened_at DESC LIMIT $${paramIndex}`;
        params.push(limit);

        const result = await query(sql, params);

        // Serializamos las fechas y números para evitar problemas con JSON en Next.js
        const history = result.rows.map(row => ({
            ...row,
            opening_amount: Number(row.opening_amount),
            closing_amount: row.closing_amount ? Number(row.closing_amount) : null,
            difference: row.difference ? Number(row.difference) : null,
            // Convertir fechas a ISO strings o timestamps si vienen como objetos Date
            opened_at: new Date(row.opened_at).getTime(),
            closed_at: row.closed_at ? new Date(row.closed_at).getTime() : null,
        }));

        return { success: true, data: history };

    } catch (error: any) {
        console.error('❌ HISTORY ERROR:', error); // DEBUG
        logger.error({ error, filters }, 'Error fetching shift history');
        return { success: false, error: 'Error al obtener historial' };
    }
}

export async function getShiftDetails(sessionId: string) {
    try {
        if (!sessionId) return { success: false, error: 'Session ID requerido' };

        // 1. Obtener datos base de la sesión (reuso parcial query anterior pero para 1 ID)
        const sessionRes = await query(`
            SELECT 
                s.id, s.terminal_id, t.name as terminal_name,
                s.user_id, u.name as user_name,
                s.opened_at, s.closed_at,
                s.opening_amount, s.closing_amount, s.cash_difference,
                s.status, s.notes, s.expected_closing_amount
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id::text = u.id
            WHERE s.id = $1::uuid
        `, [sessionId]);

        if (sessionRes.rows.length === 0) {
            return { success: false, error: 'Sesión no encontrada' };
        }

        const session = sessionRes.rows[0];

        // 2. Resumen de Movimientos de Caja (Solo Efectivo)
        const movementsRes = await query(`
            SELECT type, SUM(amount) as total, COUNT(*) as count
            FROM cash_movements
            WHERE session_id = $1::uuid
            GROUP BY type
        `, [sessionId]);

        const movements = movementsRes.rows;

        // 3. Resumen de Ventas por Método de Pago
        const salesRes = await query(`
            SELECT 
                payment_method, 
                SUM(total_amount) as total_amount,
                COUNT(id) as tx_count
            FROM sales
            WHERE session_id = $1::uuid
            GROUP BY payment_method
        `, [sessionId]);

        const sales = salesRes.rows;

        // 4. Calcular Totales
        const openingAmount = Number(session.opening_amount || 0);

        // Ventas Efectivo
        const cashSales = Number(sales.find(s => s.payment_method === 'CASH' || s.payment_method === 'EFECTIVO')?.total_amount || 0);

        // Otros Medios
        const cardSales = Number(sales.find(s => ['DEBIT', 'CREDIT', 'TARJETA'].includes(s.payment_method))?.total_amount || 0);
        const transferSales = Number(sales.find(s => ['TRANSFER', 'TRANSFERENCIA'].includes(s.payment_method))?.total_amount || 0);

        // Movimientos
        const withdrawals = movements
            .filter(m => ['RETIRO', 'EGRESO', 'WITHDRAWAL', 'EXPENSE'].includes(m.type))
            .reduce((sum, m) => sum + Number(m.total), 0);

        const deposits = movements
            .filter(m => ['INGRESO', 'DEPOSITO', 'EXTRA_INCOME', 'DEPOSIT'].includes(m.type))
            .reduce((sum, m) => sum + Number(m.total), 0);

        // Efectivo Teórico
        // Inicial + Ventas Efectivo + Ingresos - Retiros
        const theoreticalCash = openingAmount + cashSales + deposits - withdrawals;

        return {
            success: true,
            data: {
                session: {
                    ...session,
                    opened_at: new Date(session.opened_at).getTime(),
                    closed_at: session.closed_at ? new Date(session.closed_at).getTime() : null,
                    opening_amount: Number(session.opening_amount),
                    closing_amount: session.closing_amount ? Number(session.closing_amount) : null,
                    cash_difference: session.cash_difference ? Number(session.cash_difference) : null,
                    expected_closing_amount: session.expected_closing_amount ? Number(session.expected_closing_amount) : null
                },
                summary: {
                    openingAmount,
                    cashSales,
                    cardSales,
                    transferSales,
                    withdrawals,
                    deposits,
                    theoreticalCash
                },
                details: {
                    salesByMethod: sales.map(s => ({ ...s, total_amount: Number(s.total_amount) })),
                    movementsByType: movements.map(m => ({ ...m, total: Number(m.total) }))
                }
            }
        };

    } catch (error: any) {
        console.error('❌ SHIFT DETAIL ERROR:', error);
        return { success: false, error: 'Error obteniendo detalle de turno' };
    }
}

export async function reopenShift(sessionId: string) {
    try {
        if (!sessionId) return { success: false, error: 'ID de sesión requerido' };

        // 1. Verificar estado actual de la sesión y la terminal
        const sessionRes = await query(`
            SELECT s.id, s.terminal_id, s.user_id, t.status as terminal_status
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1::uuid
        `, [sessionId]);

        if (sessionRes.rows.length === 0) {
            return { success: false, error: 'Sesión no encontrada' };
        }

        const session = sessionRes.rows[0];

        // 2. Validar conflicto con sesión activa (Soporte para "Void & Swap")
        if (session.terminal_status === 'OPEN') {
            // Buscar la sesión activa en cash_register_sessions
            const activeSessionRes = await query(`
                SELECT id 
                FROM cash_register_sessions 
                WHERE terminal_id = $1::uuid AND status = 'OPEN'
                ORDER BY opened_at DESC
                LIMIT 1
            `, [session.terminal_id]);

            const activeSessionId = activeSessionRes.rows[0]?.id;

            if (activeSessionId) {
                // Verificar si la sesión activa tiene ventas
                const salesCheck = await query(`SELECT COUNT(*) as count FROM sales WHERE session_id = $1::uuid`, [activeSessionId]);
                const salesCount = Number(salesCheck.rows[0].count);

                if (salesCount > 0) {
                    return {
                        success: false,
                        error: 'La caja tiene un turno abierto con ventas activas. Debe cerrarlo manualmente para no perder datos.'
                    };
                }

                // SI NO TIENE VENTAS: Anulamos la sesión actual "fantasma" o "error"
                console.log(`🗑️ Voiding empty active session ${activeSessionId} in favor of reopening ${sessionId}`);
                await query(`
                    UPDATE cash_register_sessions 
                    SET status = 'CLOSED_AUTO', 
                        closed_at = NOW(), 
                        notes = 'Anulado automáticamente por reapertura de turno previo',
                        closing_amount = 0,
                        expected_closing_amount = 0
                    WHERE id = $1::uuid
                `, [activeSessionId]);

                // Limpiamos sus movimientos para no afectar contabilidad
                await query(`DELETE FROM cash_movements WHERE session_id = $1::uuid`, [activeSessionId]);
            }
        }

        // 3. Ejecutar restauración atómica
        // A. Restaurar Sesión Objetivo
        await query(`
            UPDATE cash_register_sessions
            SET 
                status = 'OPEN',
                closed_at = NULL,
                closing_amount = NULL,
                cash_difference = NULL,
                notes = NULL,
                expected_closing_amount = NULL
            WHERE id = $1::uuid
        `, [sessionId]);

        // B. Restaurar Terminal (Apuntar al turno reabierto)
        await query(`
            UPDATE terminals
            SET 
                status = 'OPEN',
                current_cashier_id = $2::text
            WHERE id = $3::uuid
        `, [sessionId, session.user_id, session.terminal_id]);

        // C. Eliminar Movimiento de Cierre Anterior
        await query(`
            DELETE FROM cash_movements
            WHERE session_id = $1::uuid AND type = 'CIERRE'
        `, [sessionId]);

        console.log(`♻️ Shift ${sessionId} REOPENED by system request`);
        return { success: true };

    } catch (error: any) {
        console.error('❌ REOPEN SHIFT ERROR:', error);
        return { success: false, error: 'Error al reabrir el turno' };
    }
}
