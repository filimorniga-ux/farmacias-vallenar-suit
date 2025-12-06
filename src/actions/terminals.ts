'use server';

import { query } from '@/lib/db';
import { Terminal } from '@/domain/types';
import { revalidatePath } from 'next/cache';

/**
 * Registers a new terminal (or updates existing one based on ID).
 * If hardwareId is provided (e.g., from local storage or cookie), we can link it.
 */
export async function registerTerminal(terminalId: string, locationId: string, name: string) {
    try {
        // Upsert terminal
        await query(`
            INSERT INTO terminals (id, location_id, name, status, created_at)
            VALUES ($1, $2, $3, 'CLOSED', NOW())
            ON CONFLICT (id) DO UPDATE 
            SET location_id = $2, name = $3
        `, [terminalId, locationId, name]);

        revalidatePath('/');
        return { success: true, message: 'Terminal Registered' };
    } catch (error) {
        console.error('Error registering terminal:', error);
        return { success: false, error: 'Database Error' };
    }
}

/**
 * Opens a terminal for a shift.
 * Sets status to OPEN and assigns current cashier.
 */
export async function openTerminal(terminalId: string, userId: string, initialCash: number) {
    try {
        // 1. Check if already open
        const existing = await query('SELECT status FROM terminals WHERE id = $1', [terminalId]);
        if (existing.rows[0]?.status === 'OPEN') {
            return { success: false, error: 'Terminal is already open' };
        }

        // 2. Register Opening Cash Movement
        // We'll call createCashMovement internally or let the frontend do it?
        // Better to do it transactionally here.
        // Importing createCashMovement might cause circular deps if not careful.
        // We'll direct insert for speed/safety within this transaction block logic if needed, 
        // but calling the action is cleaner.
        const { createCashMovement } = await import('./cash');

        const movementResult = await createCashMovement({
            shift_id: terminalId, // Linking to terminal/shift
            user_id: userId,
            type: 'APERTURA',
            amount: initialCash,
            description: 'Apertura de Caja',
            timestamp: Date.now(),
            reason: 'INITIAL_FUND',
            is_cash: true,
            id: '' // Auto-generated
        } as any); // Type assertion for loose compatibility

        if (!movementResult.success) {
            throw new Error('Failed to register initial cash');
        }

        // 3. Update Terminal Status
        await query(`
            UPDATE terminals 
            SET status = 'OPEN', current_cashier_id = $2
            WHERE id = $1
        `, [terminalId, userId]);

        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error('Error opening terminal:', error);
        return { success: false, error: 'Failed to open terminal' };
    }
}

/**
 * Closes a terminal.
 */
export async function closeTerminal(terminalId: string, userId: string, finalCash: number, comments: string) {
    try {
        const { createCashMovement } = await import('./cash');

        // Register Closing Movement (or just log it?)
        // Usually we register the "Declared Cash" or "Withdrawal of all cash".
        // Let's standard: Register CLOSING event.

        const movementResult = await createCashMovement({
            shift_id: terminalId,
            user_id: userId,
            type: 'CIERRE',
            amount: finalCash, // This is what is counted
            description: `Cierre de Caja: ${comments}`,
            timestamp: Date.now(),
            reason: 'OTHER', // Closing logic
            is_cash: true,
            id: ''
        } as any);

        if (!movementResult.success) {
            throw new Error('Failed to register closing cash');
        }

        await query(`
            UPDATE terminals 
            SET status = 'CLOSED', current_cashier_id = NULL
            WHERE id = $1
        `, [terminalId]);

        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error('Error closing terminal:', error);
        return { success: false, error: 'Failed to close terminal' };
    }
}

export async function getTerminalStatus(terminalId: string) {
    try {
        const res = await query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
        if (res.rows.length === 0) return null;
        return {
            id: res.rows[0].id,
            name: res.rows[0].name,
            status: res.rows[0].status,
            current_cashier_id: res.rows[0].current_cashier_id
        };
    } catch (error) {
        return null;
    }
}
