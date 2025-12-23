
'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/**
 * 🚀 ATOMIC TERMINAL OPENING (v2)
 * Ensures consistency between Session Creation, Cash Movement, and Terminal Status.
 * Prevents "Zombie" states where a terminal looks closed locally but is open in DB.
 */
// 🚀 ATOMIC TERMINAL OPENING (v2) - REAL TRANSACTIONS
// Ensures consistency between Session Creation, Cash Movement, and Terminal Status.

import { z } from 'zod';
import { logger } from '@/lib/logger';

const OpenTerminalSchema = z.object({
    terminalId: z.string().uuid({ message: "ID de terminal inválido" }),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    initialCash: z.number().min(0, { message: "El fondo inicial no puede ser negativo" })
});

const CloseTerminalSchema = z.object({
    terminalId: z.string().uuid(),
    userId: z.string().min(1),
    finalCash: z.number().min(0),
    withdrawalAmount: z.number().min(0),
    comments: z.string().optional()
});

export async function openTerminalAtomic(terminalId: string, userId: string, initialCash: number) {
    // 1. Validation (Fast Fail)
    const validation = OpenTerminalSchema.safeParse({ terminalId, userId, initialCash });
    if (!validation.success) {
        logger.warn({ error: validation.error.format(), userId, terminalId }, 'Invalid Input for openTerminalAtomic');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId }, '🔐 [Atomic v2] Starting transaction: Open Terminal');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Check Idempotency (dentro de transacción para consistencia)
        const existingSession = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND closed_at IS NULL
        `, [terminalId, userId]);

        if (existingSession.rows.length > 0) {
            await client.query('COMMIT');
            logger.info({ sessionId: existingSession.rows[0].id }, '✅ [Atomic v2] Session already exists. Returning existing ID.');
            return { success: true, sessionId: existingSession.rows[0].id };
        }

        // 2. Check Availability (con FOR UPDATE para bloquear la fila y evitar race conditions)
        const termCheck = await client.query(`
            SELECT status, current_cashier_id FROM terminals WHERE id = $1 FOR UPDATE
        `, [terminalId]);

        if (termCheck.rows.length === 0) {
            throw new Error('Terminal no encontrada');
        }

        const term = termCheck.rows[0];
        if (term.status === 'OPEN' && term.current_cashier_id !== userId) {
            throw new Error('Terminal ocupado por otro usuario');
        }

        // 3. Auto-Cleanup Ghost Sessions
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), status = 'CLOSED_AUTO', notes = 'Auto-closed by new login v2'
            WHERE user_id = $1 AND closed_at IS NULL
        `, [userId]);

        // 4. Generate IDs
        const { v4: uuidv4 } = await import('uuid');
        const newSessionId = uuidv4();
        const moveId = uuidv4();

        // 5. Atomic Operations

        // A. Insert Cash Movement
        await client.query(`
            INSERT INTO cash_movements (id, location_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2, $3, 'APERTURA', $4, 'Apertura de Caja v2', NOW())
        `, [moveId, terminalId, userId, initialCash]);

        // B. Update Terminal Status
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', current_cashier_id = $2, updated_at = NOW()
            WHERE id = $1
        `, [terminalId, userId]);

        // C. Create Session
        await client.query(`
            INSERT INTO cash_register_sessions (id, terminal_id, user_id, opening_amount, status, opened_at)
            VALUES ($1, $2, $3, $4, 'OPEN', NOW())
        `, [newSessionId, terminalId, userId, initialCash]);

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ sessionId: newSessionId }, `✅ [Atomic v2] Transaction COMMITTED. Session Created.`);
        revalidatePath('/pos');
        return { success: true, sessionId: newSessionId };

    } catch (error: any) {
        // --- ROLLBACK ---
        await client.query('ROLLBACK');
        logger.error({ err: error, terminalId, userId }, '❌ [Atomic v2] Transaction ROLLED BACK');
        return { success: false, error: error.message || 'Error de base de datos' };
    } finally {
        // Liberar cliente al pool SIEMPRE
        client.release();
    }
}

/**
 * 🔒 ATOMIC TERMINAL CLOSING (v2)
 * Closes session, terminal, registers cash movement and optional remittance in ONE transaction.
 */
export async function closeTerminalAtomic(
    terminalId: string,
    userId: string,
    finalCash: number,
    comments: string,
    withdrawalAmount: number = 0
) {
    // 0. Validation
    const validation = CloseTerminalSchema.safeParse({ terminalId, userId, finalCash, comments, withdrawalAmount });
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid Input for closeTerminalAtomic');
        return { success: false, error: 'Datos de cierre inválidos' };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId }, `🔐 [Atomic v2] Starting transaction: Close Terminal`);

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Verify & Lock Terminal
        const termRes = await client.query(`
            SELECT status, current_cashier_id, location_id 
            FROM terminals WHERE id = $1 FOR UPDATE
        `, [terminalId]);

        if (termRes.rows.length === 0) throw new Error('Terminal no encontrada');
        const term = termRes.rows[0];

        // 2. Find Open Session (Locking it)
        const sessionRes = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND status = 'OPEN' AND closed_at IS NULL
            FOR UPDATE
        `, [terminalId, userId]);

        if (sessionRes.rows.length === 0) {
            logger.warn({ terminalId, userId }, '⚠️ [Atomic v2] Closing terminal but no active session found for user.');
        } else {
            const sessionId = sessionRes.rows[0].id;
            // 3. Close Session Explicitly
            await client.query(`
                UPDATE cash_register_sessions 
                SET closed_at = NOW(), status = 'CLOSED', notes = $2, expected_closing_amount = $3
                WHERE id = $1
            `, [sessionId, `Cierre Normal: ${comments}`, finalCash]);
        }

        // 4. Closing Movement
        const moveId = uuidv4();
        await client.query(`
            INSERT INTO cash_movements (id, location_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2, $3, 'CIERRE', $4, $5, NOW())
        `, [moveId, terminalId, userId, finalCash, `Cierre de Caja: ${comments}`]);

        // 5. Remittance
        if (withdrawalAmount > 0) {
            const remittanceId = uuidv4();
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, status, created_by, created_at
                ) VALUES ($1, $2, $3, $4, 'PENDING_RECEIPT', $5, NOW())
            `, [remittanceId, term.location_id, terminalId, withdrawalAmount, userId]);
        }

        // 6. Close Terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', current_cashier_id = NULL, updated_at = NOW()
            WHERE id = $1
        `, [terminalId]);

        await client.query('COMMIT');
        logger.info({ terminalId }, `✅ [Atomic v2] Terminal closed successfully.`);

        revalidatePath('/pos');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ err: error, terminalId }, '❌ [Atomic v2] Close Failed');
        return { success: false, error: error.message || 'Error cerrando terminal' };
    } finally {
        client.release();
    }
}

// Re-exports for compatibility
export { forceCloseTerminalShift, getAvailableTerminalsForShift } from './terminals';


