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
        // 1. Fetch Terminal & Check Status
        const termRes = await query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
        if (termRes.rows.length === 0) return { success: false, error: 'Terminal not found' };

        const terminal = termRes.rows[0];
        if (terminal.status === 'OPEN') {
            return { success: false, error: 'Terminal is already open' };
        }

        // 2. Fetch User & Validate Location Access
        const userRes = await query('SELECT role, assigned_location_id FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return { success: false, error: 'User not found' };

        const user = userRes.rows[0];

        // GLOBAL ROLE CHECK (Matches auth.ts logic)
        const role = (user.role || '').toUpperCase();
        const isGlobalAdmin = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF'].includes(role);

        if (!isGlobalAdmin) {
            if (user.assigned_location_id !== terminal.location_id) {
                return { success: false, error: '⛔ Acceso Denegado: No tienes contrato en esta sucursal.' };
            }
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

export async function getTerminalsByLocation(locationId: string): Promise<{ success: boolean; data?: Terminal[]; error?: string }> {
    try {
        const result = await query(
            "SELECT * FROM terminals WHERE location_id = $1 ORDER BY name ASC",
            [locationId]
        );

        if (result.rows.length === 0) {
            // Auto-seed if list is empty for this location (Self-Healing Data)
            const { v4: uuidv4 } = await import('uuid');
            const defaultTermId = uuidv4();
            await query(`
                INSERT INTO terminals (id, location_id, name, status, created_at)
                VALUES ($1, $2, 'Caja 1', 'CLOSED', NOW())
            `, [defaultTermId, locationId]);

            return {
                success: true,
                data: [{
                    id: defaultTermId,
                    name: 'Caja 1',
                    location_id: locationId,
                    status: 'CLOSED'
                }]
            };
        }

        const terminals: Terminal[] = result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            location_id: row.location_id,
            status: row.status === 'OPEN' ? 'OPEN' : 'CLOSED'
        }));

        return { success: true, data: terminals };
    } catch (error: any) {
        // Self-Healing: Create table if it doesn't exist
        if (error.code === '42P01') {
            console.warn('⚠️ Terminals table missing. Auto-creating...');
            try {
                await query(`
                    CREATE TABLE IF NOT EXISTS terminals (
                        id UUID PRIMARY KEY,
                        location_id UUID, 
                        name TEXT NOT NULL,
                        status TEXT DEFAULT 'CLOSED',
                        current_cashier_id TEXT,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                `);

                // Seed it (Assume we have a location from previous step, or just random UUID for location logic if user selected something)
                // But we need to link it to the locationId passed in logic? 
                // Wait, if table is empty, we should seed for THIS locationId or a generic default?
                // Ideally, if locationId is provided, we create a terminal for IT.
                // But usually we just create a default linked to the default Location created in locations.ts.

                // Let's create a default terminal for the requested locationId so the UI isn't empty.
                const { v4: uuidv4 } = await import('uuid');
                const defaultTermId = uuidv4();

                await query(`
                    INSERT INTO terminals (id, location_id, name, status, created_at)
                    VALUES ($1, $2, 'Caja 1', 'CLOSED', NOW())
                `, [defaultTermId, locationId]);

                return {
                    success: true,
                    data: [{
                        id: defaultTermId,
                        name: 'Caja 1',
                        location_id: locationId,
                        status: 'CLOSED'
                    }]
                };
            } catch (createError) {
                console.error('❌ Failed to create terminals table:', createError);
                return { success: false, error: 'Database Schema Error' };
            }
        }
        console.error('Error fetching terminals:', error);
        return { success: false, error: 'Failed to fetch terminals' };
    }
}
