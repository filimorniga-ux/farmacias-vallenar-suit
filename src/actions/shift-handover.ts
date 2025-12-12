'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { createRemittance } from './treasury'; // reusing closeShift or closeTerminal logic? 
// Actually, closeTerminal in terminals.ts was modified to use createRemittance.
// But we need a more specific flow here.
// I will import closeTerminal logic or rewrite a specific one for Handover which implies user change not necessarily full terminal close, 
// BUT "Cerrar Caja" usually means "Close Shift" in this context. 
// "Cambio de Turno" implies the terminal stays "OPEN" but the User Shift closes.
// However, the current model links Terminal Status closely to Shift.
// Let's assume Handover = Close Current Shift -> Open New Shift (Optional).

const BASE_CASH = 50000;

export interface HandoverSummary {
    expectedCash: number;
    declaredCash: number;
    diff: number;
    amountToWithdraw: number;
    amountToKeep: number;
}

export async function calculateHandover(
    terminalId: string,
    declaredCash: number
): Promise<{ success: boolean; data?: HandoverSummary; error?: string }> {
    try {
        // 1. Get Current Shift & Terminal data
        // We calculate "expectedCash" based on: Initial Cash + Sales (Cash) - Withdrawals
        // This logic is likely in `terminals.ts` or `getTerminalDetails`.
        // For now, let's query the shift balance directly if possible, or re-calc.

        // Assuming `shifts` table has `final_cash` or we sum `orders`.
        // Let's look at `getTerminalDetails` query in `terminals.ts` to see how balance is calculated.
        // Or simplified: Just take the current `cash_balance` from `terminals` table if it tracks real-time.

        const termRes = await query("SELECT cash_balance FROM terminals WHERE id = $1", [terminalId]);
        if (termRes.rowCount === 0) return { success: false, error: 'Terminal not found' };

        const expectedCash = Number(termRes.rows[0].cash_balance || 0);
        const diff = declaredCash - expectedCash;

        // Smart Withdrawal Logic
        // We want to keep BASE_CASH.
        // If declared < BASE_CASH, we withdraw 0 (and we are short).
        // If declared > BASE_CASH, we withdraw (declared - BASE_CASH).

        let amountToKeep = BASE_CASH;
        let amountToWithdraw = 0;

        if (declaredCash > BASE_CASH) {
            amountToWithdraw = declaredCash - BASE_CASH;
            amountToKeep = BASE_CASH;
        } else {
            // If we have less than base, we keep everything we have (though we are under base).
            amountToKeep = declaredCash;
            amountToWithdraw = 0;
        }

        return {
            success: true,
            data: {
                expectedCash,
                declaredCash,
                diff,
                amountToWithdraw,
                amountToKeep
            }
        };

    } catch (error: any) {
        console.error('Error calculating handover:', error);
        return { success: false, error: error.message };
    }
}

export async function executeHandover(
    terminalId: string,
    summary: HandoverSummary,
    userId: string,
    nextUserId?: string // Optional for auto-start
): Promise<{ success: boolean; error?: string }> {
    const client = await import('@/lib/db').then(mod => mod.pool.connect());
    try {
        await client.query('BEGIN');

        // 1. Verify Terminal & Shift
        const termRes = await client.query("SELECT * FROM terminals WHERE id = $1 FOR UPDATE", [terminalId]);
        const terminal = termRes.rows[0];
        if (!terminal) throw new Error('Terminal not found');

        // Get active shift
        const shiftRes = await client.query("SELECT * FROM shifts WHERE terminal_id = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1", [terminalId]);
        const currentShift = shiftRes.rows[0];

        if (!currentShift) throw new Error('No active shift found');

        // 2. Create Treasury Remittance (if withdrawal > 0)
        // If detailed audit is needed, we create a remittance record even for $0?
        // Requirement: "Historial de Rendiciones". Yes, likely we want a record saying "Closed with $X, Diff $Y".

        const remittanceId = uuidv4();
        // Insert Remittance with V3 columns
        await client.query(`
            INSERT INTO treasury_remittances (
                id, location_id, source_terminal_id, amount, status, created_by, created_at,
                shift_start, shift_end, cash_count_diff, notes
            ) VALUES ($1, $2, $3, $4, 'PENDING_RECEIPT', $5, NOW(), $6, NOW(), $7, $8)
        `, [
            remittanceId,
            terminal.location_id,
            terminalId,
            summary.amountToWithdraw, // This is what goes to Treasury
            userId,
            currentShift.start_time,
            summary.diff,
            `Arqueo: Declarado $${summary.declaredCash} vs Sistema $${summary.expectedCash}. Base mantenida: $${summary.amountToKeep}`
        ]);

        // 3. Close Shift
        await client.query(`
            UPDATE shifts 
            SET end_time = NOW(), 
                final_cash = $1, 
                cash_difference = $2,
                status = 'CLOSED'
            WHERE id = $3
        `, [summary.declaredCash, summary.diff, currentShift.id]);

        // 4. Update Terminal Balance
        // The terminal physically keeps `amountToKeep`.
        await client.query("UPDATE terminals SET cash_balance = $1, current_user_id = NULL, status = 'CLOSED' WHERE id = $2", [summary.amountToKeep, terminalId]);

        // 5. If Next User, validation or whatever needed? 
        // For now, simpler to just close. The next user logs in normally.
        // If we want "Seamless Handover", we might set `current_user_id = nextUserId` and create new shift.
        // For safety, let's stick to Close -> Login.

        await client.query('COMMIT');

        revalidatePath('/pos');
        revalidatePath('/finance/treasury');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Handover Error:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
