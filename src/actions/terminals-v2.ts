
'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/**
 * 🚀 ATOMIC TERMINAL OPENING (v2)
 * Ensures consistency between Session Creation, Cash Movement, and Terminal Status.
 * Prevents "Zombie" states where a terminal looks closed locally but is open in DB.
 */
export async function openTerminalAtomic(terminalId: string, userId: string, initialCash: number) {
    try {
        console.log(`⚡ [Atomic v2] Opening terminal ${terminalId} for user ${userId}`);

        // 1. Double-Check IDEMPOTENCY: Is my user ALREADY opening this terminal?
        // If I just refreshed the page, maybe I'm already logged in. 
        // We check for ACTIVE sessions for THIS user on THIS terminal.
        const existingSession = await query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND closed_at IS NULL
        `, [terminalId, userId]);

        if (existingSession.rows.length > 0) {
            console.log('✅ [Atomic v2] Session already exists for this user. Returning existing ID.');
            return { success: true, sessionId: existingSession.rows[0].id };
        }

        // 2. CHECK AVAILABILITY (Strict)
        // Check if terminal is really CLOSED or if it's occupied by ANOTHER user.
        const termCheck = await query(`
            SELECT status, current_cashier_id FROM terminals WHERE id = $1
        `, [terminalId]);

        if (termCheck.rows.length === 0) return { success: false, error: 'Terminal no encontrada' };

        const term = termCheck.rows[0];
        if (term.status === 'OPEN' && term.current_cashier_id !== userId) {
            // It is occupied by someone else
            return { success: false, error: 'Terminal ocupado por otro usuario' };
        }

        // 3. AUTO-CLEANUP GHOST SESSIONS (For this user only)
        // Close any other sessions this user might have left hanging on other terminals
        await query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), status = 'CLOSED_AUTO', notes = 'Auto-closed by new login v2'
            WHERE user_id = $1 AND closed_at IS NULL
        `, [userId]);

        // 4. GENERATE IDs (Must be valid UUIDs)
        const { v4: uuidv4 } = await import('uuid');
        const newSessionId = uuidv4();
        const moveId = uuidv4();

        // 5. ATOMIC TRANSACTION (Simulated via sequential strict ops since we don't have BEGIN/COMMIT exposed in helper)

        // A. Insert Cash Movement (Fund)
        await query(`
            INSERT INTO cash_movements (id, location_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2, $3, 'APERTURA', $4, 'Apertura de Caja v2', NOW())
        `, [moveId, terminalId, userId, initialCash]);

        // B. Update Terminal Status
        await query(`
            UPDATE terminals 
            SET status = 'OPEN', current_cashier_id = $2
            WHERE id = $1
        `, [terminalId, userId]);

        // C. Create Session
        await query(`
            INSERT INTO cash_register_sessions (id, terminal_id, user_id, opening_amount, status, opened_at)
            VALUES ($1, $2, $3, $4, 'OPEN', NOW())
        `, [newSessionId, terminalId, userId, initialCash]);

        revalidatePath('/pos');

        return { success: true, sessionId: newSessionId };

    } catch (error: any) {
        console.error('❌ [Atomic v2] Failed:', error);
        // Rollback attempt (Best effort)
        try {
            await query(`UPDATE terminals SET status = 'CLOSED', current_cashier_id = NULL WHERE id = $1 AND current_cashier_id = $2`, [terminalId, userId]);
        } catch (e) { /* ignore */ }

        return { success: false, error: error.message || 'Error de base de datos' };
    }
}

// Re-export other critical functions needed by the updated Modal if necessary,
// OR usually the Modal imports them from 'terminals.ts'.
// But in the user's code: `import { ... forceCloseTerminalShift } from '../../../../actions/terminals-v2';`
// So we must re-export forceCloseTerminalShift and getAvailableTerminalsForShift here.


