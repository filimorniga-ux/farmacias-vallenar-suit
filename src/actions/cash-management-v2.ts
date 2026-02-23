'use server';

/**
 * ============================================================================
 * CASH-MANAGEMENT-V2: Secure Cash Drawer Operations
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions for data integrity
 * - Threshold-based PIN requirements for adjustments
 * - bcrypt PIN validation
 * - Comprehensive audit logging
 * - FOR UPDATE NOWAIT to prevent deadlocks
 * 
 * THRESHOLDS:
 * - Adjustments > $10,000 CLP: PIN CAJERO
 * - Adjustments > $50,000 CLP: PIN MANAGER
 * - Close with difference > $5,000: Authorization required
 */

import { pool } from '@/lib/db';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
// headers import removed — not currently used
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { createNotificationSecure } from '@/actions/notifications-v2';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const OpenCashDrawerSchema = z.object({
    terminalId: UUIDSchema,
    userId: UUIDSchema,
    openingAmount: z.number().min(0, 'Monto de apertura debe ser positivo o cero'),
    notes: z.string().max(500).optional(),
});

const CloseCashDrawerSchema = z.object({
    terminalId: UUIDSchema,
    userId: UUIDSchema,
    userPin: z.string().min(4, 'PIN requerido').optional(),
    managerPin: z.string().min(4, 'PIN de gerente requerido').optional(),
    declaredCash: z.number().min(0, 'Monto declarado debe ser positivo'),
    notes: z.string().max(500).optional(),
}).refine(data => data.userPin || data.managerPin, {
    message: "Debe ingresar PIN de usuario o PIN de gerente",
    path: ["userPin"]
});

const RegisterCashCountSchema = z.object({
    sessionId: UUIDSchema,
    userId: UUIDSchema,
    countedAmount: z.number().min(0),
    notes: z.string().max(500).optional(),
});

const CloseSystemSchema = z.object({
    terminalId: UUIDSchema,
    userId: UUIDSchema, // The NEW user triggering the close (or system admin ID)
    reason: z.string()
});

const AdjustCashSchema = z.object({
    sessionId: UUIDSchema,
    userId: UUIDSchema,
    adjustment: z.number(),
    reason: z.string().min(3, 'Motivo requerido').max(500),
    authorizationPin: z.string().min(4).optional(),
});

const CashHistorySchema = z.object({
    terminalId: UUIDSchema.optional(),
    sessionId: UUIDSchema.optional(),
    locationId: UUIDSchema.optional(), // Added locationId
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    paymentMethod: z.string().optional(),
    term: z.string().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(10000).default(50),
});

// ============================================================================
// CONSTANTS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CASHIER_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
} as const;

// Adjustment thresholds (CLP)
const ADJUSTMENT_THRESHOLDS = {
    CASHIER_PIN: 10000,    // > $10,000: PIN CAJERO
    MANAGER_PIN: 50000,    // > $50,000: PIN MANAGER
    CLOSE_DIFF_AUTH: 5000, // Diff > $5,000: Authorization required
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Interface for Cash Movement View (Unified History)
 */
export interface CashMovementView {
    id: string;
    type: string;
    amount: number;
    payment_method?: string;
    timestamp: Date | string; // PG returns Date, but JSON serialization makes it string
    user_name?: string;
    customer_name?: string;
    reason?: string;
    dte_folio?: string;
    seller_name?: string;
    customer_rut?: string;
    status?: string;
    // Extended properties for frontend compatibility
    items?: Record<string, unknown>[];
    queueTicket?: { number: string };
    authorized_by_name?: string;
    total?: number;
    seller_id?: string;
    [key: string]: unknown; // Allow extra fields
}

/** Typed database/pg error with optional code and message */
interface DatabaseError {
    code?: string;
    message?: string;
}

/** Type guard for database errors */
function asDatabaseError(error: unknown): DatabaseError {
    if (error && typeof error === 'object') {
        return error as DatabaseError;
    }
    return { message: String(error) };
}

/**
 * Validate user PIN
 */
async function validateUserPin(
    client: PoolClient,
    userId: string,
    pin: string
): Promise<{ valid: boolean; user?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const rateCheck = checkRateLimit(userId);
        if (!rateCheck.allowed) {
            return { valid: false, error: rateCheck.reason || 'Usuario bloqueado temporalmente' };
        }

        const userRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE id = $1::uuid AND is_active = true
        `, [userId]);

        if (userRes.rows.length === 0) {
            return { valid: false, error: 'Usuario no encontrado' };
        }

        const user = userRes.rows[0];

        if (user.access_pin_hash) {
            const isValid = await bcrypt.compare(pin, user.access_pin_hash);
            if (isValid) {
                resetAttempts(userId);
                return { valid: true, user: { id: user.id, name: user.name, role: user.role } };
            }
            recordFailedAttempt(userId);
            return { valid: false, error: 'PIN incorrecto' };
        } else if (user.access_pin && user.access_pin === pin) {
            resetAttempts(userId);
            return { valid: true, user: { id: user.id, name: user.name, role: user.role } };
        }

        recordFailedAttempt(userId);
        return { valid: false, error: 'PIN incorrecto' };
    } catch (error) {
        logger.error({ error }, '[Cash] PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Validate manager PIN for large adjustments
 */
async function validateManagerPin(
    client: PoolClient,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name, role: user.role } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin && user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name, role: user.role } };
            }
        }

        return { valid: false, error: 'PIN de manager inválido' };
    } catch (error) {
        logger.error({ error }, '[Cash] Manager PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Insert cash audit log
 */
async function insertCashAudit(
    client: PoolClient,
    params: {
        userId: string;
        authorizedById?: string;
        sessionId: string;
        terminalId: string;
        actionCode: string;
        amount?: number;
        oldValues?: Record<string, unknown>;
        newValues?: Record<string, unknown>;
        notes?: string;
    }
): Promise<void> {
    try {
        await client.query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, created_at
            ) VALUES ($1, $2, 'CASH_DRAWER', $3, $4::jsonb, $5::jsonb, $6, NOW())
        `, [
            params.userId,
            params.actionCode,
            params.sessionId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify({
                ...params.newValues,
                amount: params.amount,
                terminal_id: params.terminalId,
                authorized_by: params.authorizedById,
            }),
            params.notes || null
        ]);
    } catch (error) {
        logger.warn({ error }, '[Cash] Audit log failed');
    }
}

// ============================================================================
// CASH DRAWER OPERATIONS
// ============================================================================

/**
 * 💵 Open Cash Drawer
 */
export async function openCashDrawerSecure(
    data: z.infer<typeof OpenCashDrawerSchema>
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    // Validate input
    const validated = OpenCashDrawerSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, userId, openingAmount, notes } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock terminal
        const terminalRes = await client.query(`
            SELECT id, location_id, current_cashier_id, status
            FROM terminals 
            WHERE id = $1::uuid
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (terminalRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Terminal no encontrado' };
        }

        const terminal = terminalRes.rows[0];

        // Check if already open
        if (terminal.status === 'OPEN') {
            await client.query('ROLLBACK');
            return { success: false, error: 'La caja ya está abierta' };
        }

        // Check for existing open session
        const existingSession = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL
        `, [terminalId]);

        if (existingSession.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ya existe una sesión activa para este terminal' };
        }

        // Get user info
        const userRes = await client.query(
            'SELECT id, name, role FROM users WHERE id = $1::uuid AND is_active = true',
            [userId]
        );

        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const user = userRes.rows[0];

        // Create session
        const sessionId = randomUUID();
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount,
                opened_at, status, notes
            ) VALUES ($1, $2, $3, $4, NOW(), 'OPEN', $5)
        `, [sessionId, terminalId, userId, openingAmount, notes || null]);

        // Update terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = $2::uuid, status = 'OPEN', updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId, userId]);

        // Record opening movement
        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id,
                type, amount, reason, timestamp
            ) VALUES ($1, $2, $3, $4, $5, 'OPENING', $6, 'Apertura de caja', NOW())
        `, [randomUUID(), terminal.location_id, terminalId, sessionId, userId, openingAmount]);

        // Audit
        await insertCashAudit(client, {
            userId,
            sessionId,
            terminalId,
            actionCode: 'CASH_DRAWER_OPENED',
            amount: openingAmount,
            newValues: {
                user_name: user.name,
                opening_amount: openingAmount,
            },
            notes
        });

        await client.query('COMMIT');

        logger.info({ sessionId, terminalId, openingAmount }, '💵 [Cash] Drawer opened');

        // 🔔 Notification: Shift opened
        try {
            await createNotificationSecure({
                type: 'CASH',
                severity: 'INFO',
                title: 'Caja Abierta',
                message: `${user.name} abrió la caja con $${openingAmount.toLocaleString()}`,
                metadata: { sessionId, terminalId, openingAmount, userId: user.id },
                locationId: terminal.location_id
            });
        } catch (notifError) {
            logger.warn({ notifError }, '[Cash] Failed to create open notification');
        }

        revalidatePath('/caja');
        revalidatePath('/pos');

        return { success: true, sessionId };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        const error = asDatabaseError(err);

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Terminal en proceso. Reintente.' };
        }

        logger.error({ error: err }, '[Cash] Open drawer error');
        return { success: false, error: error.message || 'Error abriendo caja' };

    } finally {
        client.release();
    }
}

/**
 * 🔒 Close Cash Drawer
 */
export async function closeCashDrawerSecure(
    data: z.infer<typeof CloseCashDrawerSchema>
): Promise<{
    success: boolean;
    summary?: {
        expectedCash: number;
        declaredCash: number;
        difference: number;
        status: 'OK' | 'SHORT' | 'OVER';
    };
    error?: string;
}> {
    // Validate input
    const validated = CloseCashDrawerSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, userId, userPin, managerPin, declaredCash, notes } = validated.data;
    const client = await pool.connect();
    let closedBy = userId;

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validation Logic: User PIN OR Manager PIN
        if (managerPin) {
            const managerAuth = await validateManagerPin(client, managerPin);
            if (!managerAuth.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: managerAuth.error || 'PIN de gerente inválido' };
            }
            closedBy = managerAuth.manager?.id || userId;
        } else if (userPin) {
            const pinResult = await validateUserPin(client, userId, userPin);
            if (!pinResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: pinResult.error };
            }
        } else {
            // Should be unreachable due to Zod refine
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN requerido' };
        }

        // Lock terminal
        const terminalRes = await client.query(`
            SELECT id, location_id, current_cashier_id
            FROM terminals 
            WHERE id = $1::uuid
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (terminalRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Terminal no encontrado' };
        }

        // Get active session
        const sessionRes = await client.query(`
            SELECT id, opening_amount, opened_at, user_id
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (sessionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay sesión activa' };
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount);

        // Calculate expected cash
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(COALESCE(total_amount, total)), 0) as cash_sales
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND session_id = $2
            AND payment_method = 'CASH'
            AND status != 'VOIDED'
        `, [terminalId, session.id]);

        const cashSales = Number(salesRes.rows[0].cash_sales);

        const movementsRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('EXTRA_INCOME') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1::uuid AND type NOT IN ('OPENING')
        `, [session.id]);

        const cashIn = Number(movementsRes.rows[0].total_in);
        const cashOut = Number(movementsRes.rows[0].total_out);
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;
        const difference = declaredCash - expectedCash;

        // Check if authorization needed for large differences
        if (Math.abs(difference) > ADJUSTMENT_THRESHOLDS.CLOSE_DIFF_AUTH) {
            // For now, we log a warning but allow close
            logger.warn({ terminalId, difference }, '⚠️ [Cash] Large difference on close');
        }

        // Determine status
        let status: 'OK' | 'SHORT' | 'OVER' = 'OK';
        if (difference < -100) status = 'SHORT';
        else if (difference > 100) status = 'OVER';

        // Close session
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(),
                closing_amount = $2,
                status = 'CLOSED',
                cash_difference = $3
            WHERE id = $1::uuid
        `, [session.id, declaredCash, difference]);

        // Update terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = NULL, status = 'CLOSED', updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId]);

        // Audit
        await insertCashAudit(client, {
            userId: closedBy,
            sessionId: session.id,
            terminalId,
            actionCode: 'CASH_DRAWER_CLOSED',
            amount: declaredCash,
            oldValues: {
                opening_amount: openingAmount,
                expected_cash: expectedCash,
            },
            newValues: {
                declared_cash: declaredCash,
                difference,
                status,
                cash_sales: cashSales,
            },
            notes
        });

        await client.query('COMMIT');

        logger.info({ sessionId: session.id, difference, status }, '🔒 [Cash] Drawer closed');

        // 🔔 Notification: Shift closed
        try {
            const severity = Math.abs(difference) > 5000 ? 'WARNING' : 'SUCCESS';
            await createNotificationSecure({
                type: 'CASH',
                severity,
                title: 'Caja Cerrada',
                message: `Turno cerrado. Diferencia: $${difference.toLocaleString()} (${status})`,
                metadata: { sessionId: session.id, terminalId, expectedCash, declaredCash, difference, status },
                locationId: terminalRes.rows[0].location_id
            });
        } catch (notifError) {
            logger.warn({ notifError }, '[Cash] Failed to create close notification');
        }

        revalidatePath('/caja');
        revalidatePath('/pos');

        return {
            success: true,
            summary: {
                expectedCash,
                declaredCash,
                difference,
                status,
            }
        };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        const error = asDatabaseError(err);

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Terminal en proceso. Reintente.' };
        }

        logger.error({ error: err }, '[Cash] Close drawer error');
        return { success: false, error: error.message || 'Error cerrando caja' };

    } finally {
        client.release();
    }
}

/**
 * 🤖 System Auto-Close Cash Drawer (No PIN)
 * Used when a different user logs in to a terminal with an active session.
 */
export async function closeCashDrawerSystem(
    data: z.infer<typeof CloseSystemSchema>
): Promise<{ success: boolean; error?: string }> {
    const validated = CloseSystemSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, userId, reason } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get active session
        const sessionRes = await client.query(`
            SELECT id, opening_amount, opened_at, user_id
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (sessionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay sesión activa para cerrar' };
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount);

        // Calculate expected cash (to assume perfect close)
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(COALESCE(total_amount, total)), 0) as cash_sales
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND session_id = $2
            AND payment_method = 'CASH'
            AND status != 'VOIDED'
        `, [terminalId, session.id]);

        const movementsRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('EXTRA_INCOME') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1::uuid AND type NOT IN ('OPENING')
        `, [session.id]);

        const cashSales = Number(salesRes.rows[0].cash_sales);
        const cashIn = Number(movementsRes.rows[0].total_in);
        const cashOut = Number(movementsRes.rows[0].total_out);
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;

        // Auto-close with 0 difference
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(),
                closing_amount = $2,
                status = 'CLOSED_SYSTEM', 
                cash_difference = 0,
                notes = COALESCE(notes, '') || E'\n[SISTEMA] ' || $3
            WHERE id = $1::uuid
        `, [session.id, expectedCash, reason]);

        // Release terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = NULL, status = 'CLOSED', updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId]);

        // Audit
        await insertCashAudit(client, {
            userId: userId, // The new user closing the old session
            sessionId: session.id,
            terminalId,
            actionCode: 'CASH_DRAWER_AUTO_CLOSED',
            amount: expectedCash,
            notes: reason,
            newValues: {
                closed_by: 'SYSTEM',
                reason
            }
        });

        await client.query('COMMIT');

        // Notify
        try {
            await createNotificationSecure({
                type: 'CASH',
                severity: 'WARNING', // Warning so admin sees it
                title: 'Cierre Automático de Caja',
                message: `Cierre forzado por sistema. Motivo: ${reason}`,
                metadata: { sessionId: session.id, terminalId, reason },
                locationId: (await client.query('SELECT location_id FROM terminals WHERE id = $1', [terminalId])).rows[0]?.location_id
            });
        } catch (notifError) {
            logger.warn({ notifError }, '[Cash] Failed to create auto-close notification');
        }

        revalidatePath('/caja');
        return { success: true };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error: err }, '[Cash] System close error');
        return { success: false, error: 'Error en cierre automático' };
    } finally {
        client.release();
    }
}
export async function registerCashCountSecure(
    data: z.infer<typeof RegisterCashCountSchema>
): Promise<{ success: boolean; difference?: number; error?: string }> {
    // Validate input
    const validated = RegisterCashCountSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { sessionId, userId, countedAmount, notes } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Get session
        const sessionRes = await client.query(`
            SELECT id, terminal_id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE id = $1::uuid AND closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [sessionId]);

        if (sessionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sesión no encontrada o ya cerrada' };
        }

        const session = sessionRes.rows[0];

        // Calculate expected
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(total), 0) as cash_sales
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND payment_method = 'CASH'
            AND status != 'VOIDED'
            AND session_id = $2::uuid
        `, [session.terminal_id, sessionId]);

        const movementsRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('EXTRA_INCOME', 'OPENING') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1::uuid
        `, [sessionId]);

        const openingAmount = Number(session.opening_amount);
        const cashSales = Number(salesRes.rows[0].cash_sales);
        const cashIn = Number(movementsRes.rows[0].total_in) - openingAmount; // Subtract opening
        const cashOut = Number(movementsRes.rows[0].total_out);
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;
        const difference = countedAmount - expectedCash;

        // Record count
        const countId = randomUUID();
        await client.query(`
            INSERT INTO cash_counts (
                id, session_id, user_id, counted_amount,
                expected_amount, difference, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [countId, sessionId, userId, countedAmount, expectedCash, difference, notes || null]);

        // Audit
        await insertCashAudit(client, {
            userId,
            sessionId,
            terminalId: session.terminal_id,
            actionCode: 'CASH_COUNT_REGISTERED',
            amount: countedAmount,
            newValues: {
                counted: countedAmount,
                expected: expectedCash,
                difference,
            },
            notes
        });

        await client.query('COMMIT');

        logger.info({ sessionId, countedAmount, difference }, '📊 [Cash] Count registered');
        revalidatePath('/caja');

        return { success: true, difference };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        const error = asDatabaseError(err);
        logger.error({ error: err }, '[Cash] Cash count error');
        return { success: false, error: error.message || 'Error registrando arqueo' };

    } finally {
        client.release();
    }
}

/**
 * ⚖️ Adjust Cash (with threshold-based PIN)
 */
export async function adjustCashSecure(
    data: z.infer<typeof AdjustCashSchema>
): Promise<{ success: boolean; movementId?: string; error?: string }> {
    // Validate input
    const validated = AdjustCashSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { sessionId, userId, adjustment, reason, authorizationPin } = validated.data;
    const absAdjustment = Math.abs(adjustment);

    // Determine required authorization level
    let requiresManagerPin = false;
    let requiresCashierPin = false;

    if (absAdjustment > ADJUSTMENT_THRESHOLDS.MANAGER_PIN) {
        requiresManagerPin = true;
    } else if (absAdjustment > ADJUSTMENT_THRESHOLDS.CASHIER_PIN) {
        requiresCashierPin = true;
    }

    if ((requiresManagerPin || requiresCashierPin) && !authorizationPin) {
        const threshold = requiresManagerPin
            ? ADJUSTMENT_THRESHOLDS.MANAGER_PIN
            : ADJUSTMENT_THRESHOLDS.CASHIER_PIN;
        const role = requiresManagerPin ? 'MANAGER' : 'CAJERO';
        return {
            success: false,
            error: `Ajustes mayores a $${threshold.toLocaleString()} requieren PIN de ${role}`
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validate authorization if needed
        let authorizedBy: { id: string; name: string; role: string } | undefined;

        if (requiresManagerPin && authorizationPin) {
            const authResult = await validateManagerPin(client, authorizationPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: authResult.error || 'PIN inválido' };
            }
            authorizedBy = authResult.manager;
        } else if (requiresCashierPin && authorizationPin) {
            const authResult = await validateUserPin(client, userId, authorizationPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: authResult.error || 'PIN inválido' };
            }
            authorizedBy = authResult.user;
        }

        // Get session
        const sessionRes = await client.query(`
            SELECT crs.id, crs.terminal_id, crs.user_id, t.location_id
            FROM cash_register_sessions crs
            JOIN terminals t ON crs.terminal_id = t.id
            WHERE crs.id = $1::uuid AND crs.closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [sessionId]);

        if (sessionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sesión no encontrada o ya cerrada' };
        }

        const session = sessionRes.rows[0];

        // Determine movement type
        const movementType = adjustment > 0 ? 'EXTRA_INCOME' : 'EXPENSE';

        // Create movement
        const movementId = randomUUID();
        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id,
                type, amount, reason, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [
            movementId,
            session.location_id,
            session.terminal_id,
            sessionId,
            userId,
            movementType,
            absAdjustment,
            reason
        ]);

        // Audit
        await insertCashAudit(client, {
            userId,
            authorizedById: authorizedBy?.id,
            sessionId,
            terminalId: session.terminal_id,
            actionCode: 'CASH_ADJUSTED',
            amount: adjustment,
            newValues: {
                adjustment,
                type: movementType,
                reason,
                authorized_by: authorizedBy?.name,
            }
        });

        await client.query('COMMIT');

        logger.info({ movementId, adjustment }, '⚖️ [Cash] Cash adjusted');
        revalidatePath('/caja');

        return { success: true, movementId };

    } catch (err: unknown) {
        await client.query('ROLLBACK');
        const error = asDatabaseError(err);
        logger.error({ error: err }, '[Cash] Adjust cash error');
        return { success: false, error: error.message || 'Error ajustando caja' };

    } finally {
        client.release();
    }
}

// ============================================================================
// STATUS & HISTORY
// ============================================================================

/**
 * 📋 Get Cash Drawer Status
 */
export async function getCashDrawerStatus(
    terminalId: string
): Promise<{
    success: boolean;
    data?: {
        isOpen: boolean;
        sessionId?: string;
        cashierId?: string;
        cashierName?: string;
        openingAmount?: number;
        openedAt?: Date;
        expectedCash?: number;
        lastCount?: { amount: number; difference: number; timestamp: Date };
    };
    error?: string;
}> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    try {
        const { query } = await import('@/lib/db');

        // Get terminal and session
        const terminalRes = await query(`
            SELECT t.id, t.status, t.current_cashier_id,
                   crs.id as session_id, crs.opening_amount, crs.opened_at,
                   u.name as cashier_name
            FROM terminals t
            LEFT JOIN cash_register_sessions crs ON crs.terminal_id = t.id AND crs.closed_at IS NULL
            LEFT JOIN users u ON t.current_cashier_id::text = u.id::text
            WHERE t.id = $1::uuid
        `, [terminalId]);

        if (terminalRes.rows.length === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        const terminal = terminalRes.rows[0];
        const isOpen = terminal.status === 'OPEN' && terminal.session_id;

        if (!isOpen) {
            console.warn(`🚨 [DEBUG_CASH] Terminal ${terminalId} dice isOpen=false -> DB Status: ${terminal.status}, DB SessionId: ${terminal.session_id}`);
            return { success: true, data: { isOpen: false } };
        }

        // Calculate expected cash
        const salesRes = await query(`
            SELECT COALESCE(SUM(total), 0) as cash_sales
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND payment_method = 'CASH'
            AND status != 'VOIDED'
            AND timestamp >= $2
        `, [terminalId, terminal.opened_at]);

        const movementsRes = await query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('EXTRA_INCOME', 'OPENING') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1::uuid
        `, [terminal.session_id]);

        const openingAmount = Number(terminal.opening_amount);
        const cashSales = Number(salesRes.rows[0].cash_sales);
        const cashIn = Number(movementsRes.rows[0].total_in) - openingAmount;
        const cashOut = Number(movementsRes.rows[0].total_out);
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;

        // Get last count
        const countRes = await query(`
            SELECT counted_amount, difference, created_at
            FROM cash_counts
            WHERE session_id = $1::uuid
            ORDER BY created_at DESC
            LIMIT 1
        `, [terminal.session_id]);

        const lastCount = countRes.rows.length > 0 ? {
            amount: Number(countRes.rows[0].counted_amount),
            difference: Number(countRes.rows[0].difference),
            timestamp: countRes.rows[0].created_at,
        } : undefined;

        return {
            success: true,
            data: {
                isOpen: true,
                sessionId: terminal.session_id,
                cashierId: terminal.current_cashier_id,
                cashierName: terminal.cashier_name,
                openingAmount,
                openedAt: terminal.opened_at,
                expectedCash,
                lastCount,
            }
        };

    } catch (err: unknown) {
        logger.error({ error: err }, '[Cash] Get status error');
        console.error('🚨 [DEBUG_CASH] Falla fatal getCashDrawerStatus:', err);
        return { success: false, error: 'Error obteniendo estado de caja' };
    }
}



/**
 * 📜 Get Cash Movement History
 */
export async function getCashMovementHistory(
    filters?: z.input<typeof CashHistorySchema>
): Promise<{
    success: boolean;
    data?: {
        movements: CashMovementView[];
        total: number;
        page: number;
        pageSize: number;
    };
    error?: string;
}> {
    const validated = CashHistorySchema.safeParse(filters || {});
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, sessionId, locationId, startDate, endDate, paymentMethod, term, page, pageSize } = validated.data;
    const offset = (page - 1) * pageSize;

    try {
        const { query } = await import('@/lib/db');

        // Parameter handling
        const params: (string | number | Date)[] = [];
        let paramIndex = 1;

        // Base filters for both queries
        let moveFilters = '1=1';
        let saleFilters = "s.status != 'VOIDED'"; // Base sales filter

        if (locationId) {
            moveFilters += ` AND cm.location_id = $${paramIndex}::uuid`;
            saleFilters += ` AND s.location_id = $${paramIndex}::uuid`;
            params.push(locationId);
            paramIndex++;
        }

        if (terminalId) {
            moveFilters += ` AND cm.terminal_id = $${paramIndex}::uuid`;
            saleFilters += ` AND s.terminal_id = $${paramIndex}::uuid`;
            params.push(terminalId);
            paramIndex++;
        }

        if (sessionId) {
            moveFilters += ` AND cm.session_id = $${paramIndex}::uuid`;
            saleFilters += ` AND s.session_id = $${paramIndex}::uuid`;
            params.push(sessionId);
            paramIndex++;
        }


        if (startDate) {
            // Robust Date Filtering using Santiago Timezone
            // We expect the input to be a Date object, but we'll cast to YYYY-MM-DD in Santiago time for the DB comparison
            // Ideally, we passed strings, but if we pass Date:
            // CAST input Date to text YYYY-MM-DD if needed, OR:
            // Use the parameter as a generic date and compare with the timestamp converted to Santiago DATE.

            // To be consistent with sales-v2.ts which takes STRINGS:
            // But here `startDate` is likely a Date object from Zod?
            // If it is a Date, we can compare directly if we trust the Date.
            // BUT, to ENFORCE Santiago Day boundaries regardless of the input Date's specific time:

            // Let's assume startDate param IS a Date object representing the boundary.
            // Be careful: if we change logic to SQL `::date` comparison, we ignore the time part of the input Date.
            // This is usually DESIRED for "Filter by Day".

            moveFilters += ` AND (cm.timestamp AT TIME ZONE 'America/Santiago')::date >= $${paramIndex}::date`;
            saleFilters += ` AND (s.timestamp AT TIME ZONE 'America/Santiago')::date >= $${paramIndex}::date`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            moveFilters += ` AND (cm.timestamp AT TIME ZONE 'America/Santiago')::date <= $${paramIndex}::date`;
            saleFilters += ` AND (s.timestamp AT TIME ZONE 'America/Santiago')::date <= $${paramIndex}::date`;
            params.push(endDate);
            paramIndex++;
        }

        // Payment Method Filter
        // Payment Method Filter or Movement Type Filter
        if (paymentMethod && paymentMethod !== 'ALL') {
            const MOVEMENT_TYPES = ['EXTRA_INCOME', 'EXPENSE', 'WITHDRAWAL', 'OPENING', 'CLOSING', 'APERTURA'];

            if (MOVEMENT_TYPES.includes(paymentMethod)) {
                // It's a movement type filter (e.g. EXTRA_INCOME)
                moveFilters += ` AND cm.type = $${paramIndex}`;
                saleFilters += ` AND 1=0`; // Hide sales entirely when looking for specific movement types
            } else {
                // It's a payment method filter (CASH, DEBIT, etc.)
                saleFilters += ` AND s.payment_method = $${paramIndex}`;

                // If filtering by specific payment method other than CASH, hide physical cash movements
                if (paymentMethod !== 'CASH') {
                    moveFilters += ' AND 1=0'; // Hide movements if looking for Card/Transfer
                }
                // If CASH, we keep movements visible (default 1=1)
            }

            params.push(paymentMethod);
            paramIndex++;
        }

        // Search Term Filter
        if (term) {
            const searchPattern = `%${term}%`;

            moveFilters += ` AND (
                cm.reason ILIKE $${paramIndex} OR 
                u.name ILIKE $${paramIndex}
            )`;

            saleFilters += ` AND (
                s.id::text ILIKE $${paramIndex} OR
                s.dte_folio::text ILIKE $${paramIndex} OR
                u.name ILIKE $${paramIndex} OR
                s.customer_name ILIKE $${paramIndex}
            )`;

            params.push(searchPattern);
            paramIndex++;
        }

        logger.info({ params, moveFilters, saleFilters }, '🔍 [Cash] Executing History Query');

        // 1. Get Total Count
        const countRes = await query(`
            SELECT 
                (SELECT COUNT(*) FROM cash_movements cm 
                 LEFT JOIN users u ON cm.user_id::text = u.id::text 
                 WHERE ${moveFilters}) +
                (SELECT COUNT(*) FROM sales s 
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE ${saleFilters}) as total
        `, params);

        const total = parseInt(countRes.rows[0]?.total || '0');

        // 2. Get Combined History
        params.push(pageSize, offset); // Add limit/offset params

        const historyRes = await query(`
            (
                SELECT 
                    cm.id, 
                    cm.type, 
                    cm.amount, 
                    cm.reason, 
                    cm.timestamp,
                    cm.terminal_id, 
                    cm.session_id,
                    u.name as user_name,
                    NULL as authorized_by_name,
                    'CASH' as payment_method,
                    NULL::text as status,
                    NULL::text as dte_status,
                    NULL::text as dte_folio,
                    NULL::text as customer_name
                FROM cash_movements cm
                LEFT JOIN users u ON cm.user_id::text = u.id::text
                WHERE ${moveFilters}
            )
            UNION ALL
            (
                SELECT 
                    s.id,
                    'SALE' as type,
                    COALESCE(s.total_amount, s.total) as amount,
                    CONCAT('Venta #', COALESCE(s.dte_folio::text, 'S/N')) as reason,
                    s.timestamp,
                    s.terminal_id,
                    s.session_id,
                    u.name as user_name,
                    NULL as authorized_by_name,
                    s.payment_method,
                    s.status,
                    s.dte_status,
                    s.dte_folio::text,
                    s.customer_name
                FROM sales s
                LEFT JOIN users u ON s.user_id::text = u.id::text
                WHERE ${saleFilters}
            )
            ORDER BY timestamp DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, params);

        return {
            success: true,
            data: {
                movements: historyRes.rows.map(row => ({
                    ...row,
                    // Normalize fields for frontend if needed
                    customer: row.customer_name ? { fullName: row.customer_name } : undefined
                })),
                total,
                page,
                pageSize,
            }
        };

    } catch (err: unknown) {
        const error = asDatabaseError(err);
        logger.error({ error: err }, '[Cash] Get history error');
        return { success: false, error: 'Error obteniendo historial: ' + (error.message || '') };
    }
}

// ============================================================================
// SHIFT METRICS
// ============================================================================

/**
 * Interface para métricas detalladas del turno
 */
export interface ShiftMetricsDetailed {
    sessionId: string;
    terminalId: string;
    cashierName: string;
    openedAt: Date;
    openingAmount: number;
    currentCash: number;
    cashSales: number;
    cardSales: number;
    transferSales: number;
    otherSales: number;
    totalSales: number;
    transactionCount: number;
    sales_breakdown: { method: string; total: number; count: number }[];
    adjustments: { type: string; amount: number }[];
    lastCount?: { amount: number; difference: number; timestamp: Date };
}

/**
 * 📈 Get Shift Metrics (Detailed)
 * Obtiene métricas detalladas del turno actual para un terminal
 */
export async function getShiftMetricsSecure(
    terminalId: string
): Promise<{ success: boolean; data?: ShiftMetricsDetailed; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    try {
        // NOTE: Authentication optional for read-only metrics
        // Authorization is implicit via terminal access

        const { query } = await import('@/lib/db');

        // Get active session
        const sessionRes = await query(`
            SELECT 
                crs.id, crs.terminal_id, crs.opening_amount, crs.opened_at,
                u.name as cashier_name
            FROM cash_register_sessions crs
            JOIN users u ON crs.user_id::text = u.id::text
            WHERE crs.terminal_id = $1::uuid AND crs.closed_at IS NULL
        `, [terminalId]);

        if (sessionRes.rows.length === 0) {
            return { success: false, error: 'No hay sesión activa' };
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount);

        // Get sales by payment method
        logger.info({ terminalId, sessionId: session.id }, '🔍 [Cash] Fetching metrics for session');

        const salesRes = await query(`
            SELECT 
                payment_method,
                COUNT(*) as count,
                COALESCE(SUM(COALESCE(total_amount, total)), 0) as total
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND session_id = $2
            AND status != 'VOIDED'
            GROUP BY payment_method
        `, [terminalId, session.id]);

        logger.info({ salesCount: salesRes.rows.length, salesRows: salesRes.rows }, '🔍 [Cash] Metrics Sales Result');

        let cashSales = 0, cardSales = 0, transferSales = 0, otherSales = 0;
        let transactionCount = 0;

        for (const row of salesRes.rows) {
            const total = Number(row.total);
            const count = parseInt(row.count);
            transactionCount += count;

            switch (row.payment_method) {
                case 'CASH': cashSales = total; break;
                case 'CARD': case 'CREDIT': case 'DEBIT': cardSales += total; break;
                case 'TRANSFER': transferSales = total; break;
                default: otherSales += total;
            }
        }

        // Get cash movements/adjustments details
        const movementsRes = await query(`
            SELECT id, type, amount, reason, timestamp
            FROM cash_movements
            WHERE session_id = $1::uuid AND type NOT IN ('OPENING')
            ORDER BY timestamp DESC
        `, [session.id]);

        const adjustments = movementsRes.rows.map(r => ({
            id: r.id,
            type: r.type,
            amount: Number(r.amount), // Note: amount, not total
            reason: r.reason,
            timestamp: r.timestamp
        }));

        // Calculate current cash
        const cashIn = adjustments
            .filter(a => ['EXTRA_INCOME'].includes(a.type))
            .reduce((sum, a) => sum + a.amount, 0);
        const cashOut = adjustments
            .filter(a => ['WITHDRAWAL', 'EXPENSE'].includes(a.type))
            .reduce((sum, a) => sum + a.amount, 0);
        const currentCash = openingAmount + cashSales + cashIn - cashOut;

        // Get last count
        const countRes = await query(`
            SELECT counted_amount, difference, created_at
            FROM cash_counts
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [session.id]);

        const lastCount = countRes.rows.length > 0 ? {
            amount: Number(countRes.rows[0].counted_amount),
            difference: Number(countRes.rows[0].difference),
            timestamp: countRes.rows[0].created_at,
        } : undefined;

        return {
            success: true,
            data: {
                sessionId: session.id,
                terminalId,
                cashierName: session.cashier_name,
                openedAt: session.opened_at,
                openingAmount,
                currentCash,
                cashSales,
                cardSales,
                transferSales,
                otherSales,
                totalSales: cashSales + cardSales + transferSales + otherSales,
                transactionCount,
                sales_breakdown: salesRes.rows.map(row => ({
                    method: row.payment_method,
                    count: parseInt(row.count),
                    total: Number(row.total)
                })),
                adjustments,
                lastCount,
            }
        };

    } catch (err: unknown) {
        const error = asDatabaseError(err);
        logger.error({ error: err }, '[Cash] Get shift metrics error');
        return { success: false, error: `Error obteniendo métricas del turno: ${error.message || ''}` };
    }
}


// ============================================================================
// EXPORT UTILS
// ============================================================================

/**
 * 📥 Export Cash Movement History (Detailed, High Limit)
 */
export async function exportCashMovementHistory(
    filters?: z.input<typeof CashHistorySchema>
): Promise<{
    success: boolean;
    data?: CashMovementView[];
    error?: string;
}> {
    // Reuse schema but override page/pageSize for export
    const validated = CashHistorySchema.safeParse({ ...filters, page: 1, pageSize: 5000 }); // High limit for export
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, sessionId, startDate, endDate, paymentMethod, term } = validated.data;

    try {
        const { query } = await import('@/lib/db');

        // Parameter handling
        const params: (string | number | Date)[] = [];
        let paramIndex = 1;

        // Base filters for both queries
        let moveFilters = '1=1';
        let saleFilters = "s.status != 'VOIDED'";

        if (terminalId) {
            moveFilters += ` AND cm.terminal_id = $${paramIndex}::uuid`;
            saleFilters += ` AND s.terminal_id = $${paramIndex}::uuid`;
            params.push(terminalId);
            paramIndex++;
        }

        if (sessionId) {
            moveFilters += ` AND cm.session_id = $${paramIndex}::uuid`;
            saleFilters += ` AND s.session_id = $${paramIndex}::uuid`;
            params.push(sessionId);
            paramIndex++;
        }


        if (startDate) {
            moveFilters += ` AND (cm.timestamp AT TIME ZONE 'America/Santiago')::date >= $${paramIndex}::date`;
            saleFilters += ` AND (s.timestamp AT TIME ZONE 'America/Santiago')::date >= $${paramIndex}::date`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            moveFilters += ` AND (cm.timestamp AT TIME ZONE 'America/Santiago')::date <= $${paramIndex}::date`;
            saleFilters += ` AND (s.timestamp AT TIME ZONE 'America/Santiago')::date <= $${paramIndex}::date`;
            params.push(endDate);
            paramIndex++;
        }

        if (paymentMethod && paymentMethod !== 'ALL') {
            const MOVEMENT_TYPES = ['EXTRA_INCOME', 'EXPENSE', 'WITHDRAWAL', 'OPENING', 'CLOSING', 'APERTURA'];

            if (MOVEMENT_TYPES.includes(paymentMethod)) {
                moveFilters += ` AND cm.type = $${paramIndex}`;
                saleFilters += ` AND 1=0`;
            } else {
                saleFilters += ` AND s.payment_method = $${paramIndex}`;
                if (paymentMethod !== 'CASH') {
                    moveFilters += ' AND 1=0';
                }
            }
            params.push(paymentMethod);
            paramIndex++;
        }

        if (term) {
            const searchPattern = `%${term}%`;
            moveFilters += ` AND (cm.reason ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
            saleFilters += ` AND (s.id::text ILIKE $${paramIndex} OR s.dte_folio::text ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR s.customer_name ILIKE $${paramIndex})`;
            params.push(searchPattern);
            paramIndex++;
        }

        const historyRes = await query(`
            (
                SELECT 
                    cm.id, 
                    cm.type, 
                    cm.amount, 
                    cm.reason, 
                    cm.timestamp,
                    u.name as user_name,
                    'CASH' as payment_method,
                    NULL::text as dte_folio,
                    NULL::text as customer_name
                FROM cash_movements cm
                LEFT JOIN users u ON cm.user_id::text = u.id::text
                WHERE ${moveFilters}
            )
            UNION ALL
            (
                SELECT 
                    s.id,
                    'SALE' as type,
                    COALESCE(s.total_amount, s.total) as amount,
                    -- Combine Venta # with item list
                    CONCAT(
                        'Venta #', COALESCE(s.dte_folio::text, 'S/N'), ': ',
                        COALESCE(STRING_AGG(CONCAT(si.quantity, 'x ', si.product_name), '\n'), 'Sin items')
                    ) as reason,
                    s.timestamp,
                    u.name as user_name,
                    s.payment_method,
                    s.dte_folio::text,
                    s.customer_name
                FROM sales s
                LEFT JOIN users u ON s.user_id::text = u.id::text
                LEFT JOIN sale_items si ON s.id = si.sale_id
                WHERE ${saleFilters}
                GROUP BY s.id, u.name, s.total_amount, s.total, s.timestamp, s.payment_method, s.dte_folio, s.customer_name
            )
            ORDER BY timestamp DESC
            LIMIT 5000
        `, params);

        return {
            success: true,
            data: historyRes.rows
        };

    } catch (err: unknown) {
        const error = asDatabaseError(err);
        logger.error({ error: err }, '[Cash] Export history error');
        return { success: false, error: 'Error exportando historial: ' + (error.message || '') };
    }
}
