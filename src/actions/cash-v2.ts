'use server';

/**
 * ============================================================================
 * CASH-V2: Movimientos de Caja Seguros
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES CRÍTICAS:
 * - ELIMINADO AUTO-DDL (CREATE TABLE en catch)
 * - PIN por umbrales de monto
 * - Auditoría completa
 */

import { pool, query, type PoolClient } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinRbacError,
    ROLE_GROUPS,
    validatePinForRoles,
    validatePinForUser,
} from '@/lib/pin-rbac';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const MovementType = z.enum(['OPENING', 'CLOSING', 'WITHDRAWAL', 'EXPENSE', 'EXTRA_INCOME']);

const CreateMovementSchema = z.object({
    terminalId: UUIDSchema,
    type: MovementType,
    amount: z.number().positive('El monto debe ser positivo'),
    reason: z.string().min(3).max(200),
});

const CreateExpenseSchema = z.object({
    terminalId: UUIDSchema.optional(),
    amount: z.number().positive(),
    category: z.enum(['SUPPLIES', 'SERVICES', 'OTHER']),
    description: z.string().min(5).max(200),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const CASHIER_PIN_THRESHOLD = 20000;  // > $20,000 requiere PIN CAJERO
const MANAGER_PIN_THRESHOLD = 100000; // > $100,000 requiere PIN MANAGER

// ============================================================================
// HELPERS
// ============================================================================

async function getCashActor() {
    try {
        return await getActorOrFail();
    } catch (error) {
        if (error instanceof PinRbacError) {
            return null;
        }
        throw error;
    }
}

async function validateManagerAuthorizationPin(client: PoolClient, pin: string) {
    const result = await validatePinForRoles(client, pin, ROLE_GROUPS.MANAGER, {
        allowLegacyPlaintext: true,
        useRateLimiter: true,
    });

    if (!result.valid) {
        return { valid: false, error: 'PIN de manager inválido' } as const;
    }

    return { valid: true, authorizedBy: result.authorizedBy } as const;
}

async function validateActorPin(client: PoolClient, userId: string, pin: string) {
    const result = await validatePinForUser(client, userId, pin, {
        allowLegacyPlaintext: true,
        useRateLimiter: true,
        requiredMatchUserId: userId,
    });

    if (!result.valid) {
        return { valid: false, error: 'PIN inválido' } as const;
    }

    return { valid: true, authorizedBy: result.authorizedBy } as const;
}

// ============================================================================
// CREATE CASH MOVEMENT
// ============================================================================

/**
 * 💵 Crear Movimiento de Caja (con umbrales de PIN)
 */
export async function createCashMovementSecure(
    data: z.infer<typeof CreateMovementSchema>,
    pin?: string
): Promise<{ success: boolean; movementId?: string; error?: string }> {
    const actor = await getCashActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = CreateMovementSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, type, amount, reason } = validated.data;

    // Verificar si requiere PIN según umbral
    if (type === 'WITHDRAWAL' || type === 'EXPENSE') {
        if (amount > MANAGER_PIN_THRESHOLD) {
            if (!pin) {
                return {
                    success: false,
                    error: `Retiros > $${MANAGER_PIN_THRESHOLD.toLocaleString()} requieren PIN de manager`,
                };
            }
            const client = await pool.connect();
            try {
                const authResult = await validateManagerAuthorizationPin(client, pin);
                if (!authResult.valid) {
                    return { success: false, error: authResult.error };
                }
            } finally {
                client.release();
            }
        } else if (amount > CASHIER_PIN_THRESHOLD) {
            if (!pin) {
                return {
                    success: false,
                    error: `Retiros > $${CASHIER_PIN_THRESHOLD.toLocaleString()} requieren PIN`,
                };
            }
            const client = await pool.connect();
            try {
                const authResult = await validateActorPin(client, actor.userId, pin);
                if (!authResult.valid) {
                    return { success: false, error: authResult.error };
                }
            } finally {
                client.release();
            }
        }
    }

    try {
        const movementId = randomUUID();

        await query(`
            INSERT INTO cash_movements (id, terminal_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [movementId, terminalId, actor.userId, type, amount, reason]);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'CASH_MOVEMENT', 'CASH', $2, $3::jsonb, NOW())
        `, [actor.userId, movementId, JSON.stringify({
            type,
            amount,
            reason,
            terminal_id: terminalId,
            required_pin: amount > CASHIER_PIN_THRESHOLD,
        })]);

        logger.info({ movementId, type, amount }, '💵 [Cash] Movement created');
        revalidatePath('/caja');
        return { success: true, movementId };

    } catch (error: unknown) {
        logger.error({ error }, '[Cash] Create movement error');
        return { success: false, error: 'Error creando movimiento' };
    }
}

// ============================================================================
// CREATE EXPENSE
// ============================================================================

/**
 * 🧾 Crear Gasto (requiere PIN)
 */
export async function createExpenseSecure(
    data: z.infer<typeof CreateExpenseSchema>,
    pin: string
): Promise<{ success: boolean; expenseId?: string; error?: string }> {
    const actor = await getCashActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = CreateExpenseSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, amount, category, description } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Gastos siempre requieren PIN
        const authResult = await validateManagerAuthorizationPin(client, pin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de manager inválido para gastos' };
        }

        const expenseId = randomUUID();
        const reason = `${category}: ${description}`;

        await client.query(`
            INSERT INTO cash_movements (id, terminal_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2, $3, 'EXPENSE', $4, $5, NOW())
        `, [expenseId, terminalId, actor.userId, amount, reason]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'EXPENSE_CREATED', 'CASH', $2, $3::jsonb, NOW())
        `, [actor.userId, expenseId, JSON.stringify({
            category,
            amount,
            description,
            approved_by: authResult.authorizedBy.name,
            authorized_by_id: authResult.authorizedBy.id,
        })]);

        await client.query('COMMIT');

        logger.info({ expenseId, category, amount }, '🧾 [Cash] Expense created');
        revalidatePath('/caja');
        return { success: true, expenseId };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Cash] Create expense error');
        return { success: false, error: 'Error creando gasto' };
    } finally {
        client.release();
    }
}

// ============================================================================
// GET MOVEMENTS
// ============================================================================

/**
 * 📋 Obtener Movimientos (con RBAC)
 */
export async function getCashMovementsSecure(
    terminalId?: string,
    limit: number = 50
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const actor = await getCashActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let sql = `
            SELECT cm.*, u.name as user_name, t.name as terminal_name
            FROM cash_movements cm
            LEFT JOIN users u ON cm.user_id::text = u.id
            LEFT JOIN terminals t ON cm.terminal_id = t.id
            WHERE 1=1
        `;
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (terminalId && UUIDSchema.safeParse(terminalId).success) {
            sql += ` AND cm.terminal_id = $${paramIdx++}::uuid`;
            params.push(terminalId);
        }

        sql += ` ORDER BY cm.timestamp DESC LIMIT $${paramIdx}`;
        params.push(Math.min(limit, 100));

        const res = await query(sql, params);
        return { success: true, data: res.rows };

    } catch (error: unknown) {
        logger.error({ error }, '[Cash] Get movements error');
        return { success: false, error: 'Error obteniendo movimientos' };
    }
}

// ============================================================================
// GET BALANCE
// ============================================================================

/**
 * 💰 Obtener Saldo Actual del Terminal
 */
export async function getCashBalanceSecure(
    terminalId: string
): Promise<{ success: boolean; balance?: number; breakdown?: Record<string, number>; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const actor = await getCashActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query(`
            SELECT 
                type,
                SUM(amount) as total
            FROM cash_movements
            WHERE terminal_id = $1
              AND DATE(timestamp) = CURRENT_DATE
            GROUP BY type
        `, [terminalId]);

        const totals: Record<string, number> = {};
        res.rows.forEach((r) => totals[r.type] = parseFloat(r.total));

        const opening = totals['OPENING'] || 0;
        const income = totals['EXTRA_INCOME'] || 0;
        const expenses = (totals['EXPENSE'] || 0) + (totals['WITHDRAWAL'] || 0);

        const balance = opening + income - expenses;

        return {
            success: true,
            balance,
            breakdown: {
                opening,
                extra_income: income,
                expenses: totals['EXPENSE'] || 0,
                withdrawals: totals['WITHDRAWAL'] || 0,
            },
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Cash] Get balance error');
        return { success: false, error: 'Error obteniendo saldo' };
    }
}
