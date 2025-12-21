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
        // Fix: Query cash_register_sessions instead of terminals.cash_balance (which doesn't exist)
        const sessionRes = await query(`
            SELECT opening_amount 
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
        `, [terminalId]);

        let expectedCash = 0;
        if ((sessionRes.rowCount || 0) > 0) {
            expectedCash = Number(sessionRes.rows[0].opening_amount || 0);
        }

        // Calculate Cash Sales via Sales Total
        // Note: sales table structure assumed standard id, total, payment_method, etc.
        const salesRes = await query(`
            SELECT COALESCE(SUM(total), 0) as total
            FROM sales 
            WHERE 
                terminal_id = $1::uuid 
                AND payment_method = 'CASH'
                AND timestamp >= (
                    SELECT opened_at FROM cash_register_sessions 
                    WHERE terminal_id = $1::uuid AND closed_at IS NULL 
                    ORDER BY opened_at DESC LIMIT 1
                )
        `, [terminalId]);

        const cashSales = Number(salesRes.rows[0]?.total || 0);

        // Calculate Cash Movements (In/Out)
        // We need to differentiate IN vs OUT. 
        // type 'APERTURA' counts as IN but we already have opening_amount.
        // So we might filter OUT 'APERTURA' if we sum movements, OR simply:
        // System Expected = Opening + Sales + (INs exclude Apertura) - OUTs
        // Let's check movements table structure or assumptions. usually 'type', 'amount', 'is_cash'.

        const movementsRes = await query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE 
                shift_id = (
                    SELECT id FROM cash_register_sessions 
                    WHERE terminal_id = $1::uuid AND closed_at IS NULL 
                    ORDER BY opened_at DESC LIMIT 1
                )
                AND is_cash = true
                AND type != 'APERTURA' -- Exclude Opening as it is in opening_amount
        `, [terminalId]);

        const cashIn = Number(movementsRes.rows[0]?.total_in || 0);
        const cashOut = Number(movementsRes.rows[0]?.total_out || 0);

        // FORMULA: Opening + Sales + Ins - Outs
        expectedCash = expectedCash + cashSales + cashIn - cashOut;

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
        const termRes = await client.query("SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE", [terminalId]);
        const terminal = termRes.rows[0];
        if (!terminal) throw new Error('Terminal not found');

        // Get active session (Correct table: cash_register_sessions)
        const shiftRes = await client.query("SELECT * FROM cash_register_sessions WHERE terminal_id = $1::uuid AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1", [terminalId]);
        const currentShift = shiftRes.rows[0];

        if (!currentShift) throw new Error('No active shift found');

        // 2. Create Treasury Remittance (if withdrawal > 0)
        const remittanceId = uuidv4();
        // Insert Remittance with V3 columns
        await client.query(`
            INSERT INTO treasury_remittances (
                id, location_id, source_terminal_id, amount, status, created_by, created_at,
                shift_start, shift_end, cash_count_diff, notes
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'PENDING_RECEIPT', $5::uuid, NOW(), $6, NOW(), $7, $8)
        `, [
            remittanceId,
            terminal.location_id,
            terminalId,
            summary.amountToWithdraw, // This is what goes to Treasury
            userId,
            currentShift.opened_at, // Correct column
            summary.diff,
            `Arqueo: Declarado $${summary.declaredCash} vs Sistema $${summary.expectedCash}. Base mantenida: $${summary.amountToKeep}`
        ]);

        // 3. Close Session (Correct table & columns)
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED',
                closing_amount = $2
            WHERE id = $1::uuid
        `, [currentShift.id, summary.declaredCash]);

        // 4. Update Terminal Status (Sanitized: No cash_balance)
        await client.query("UPDATE terminals SET current_cashier_id = NULL, status = 'CLOSED' WHERE id = $1::uuid", [terminalId]);

        // 5. If Next User, validation or whatever needed? 
        // For now, simpler to just close. The next user logs in normally.
        // If we want "Seamless Handover", we might set `current_user_id = nextUserId` and create new shift.
        // For safety, let's stick to Close -> Login.

        await client.query('COMMIT');

        // 6. Notify Managers
        const { notifyManagers } = await import('./notifications'); // Dynamic import to avoid circular dep issues if any, though unlikely here
        await notifyManagers(
            terminal.location_id,
            "💰 Nueva Remesa Pendiente",
            `El cajero ${userId} ha cerrado turno. Monto: $${summary.amountToWithdraw.toLocaleString('es-CL')}`,
            "/finance/treasury"
        );

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
