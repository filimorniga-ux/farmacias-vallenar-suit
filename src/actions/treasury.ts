'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface FinancialAccount {
    id: string;
    location_id: string;
    name: string;
    type: 'SAFE' | 'BANK' | 'PETTY_CASH' | 'EQUITY';
    balance: number;
    is_active: boolean;
}

export interface TreasuryTransaction {
    id: string;
    account_id: string;
    amount: number;
    type: 'IN' | 'OUT';
    description: string;
    created_at: Date;
    created_by?: string;
}

export async function getFinancialAccounts(locationId: string): Promise<{ success: boolean; data?: FinancialAccount[]; error?: string }> {
    try {
        const res = await query(
            "SELECT * FROM financial_accounts WHERE (location_id = $1 OR location_id IS NULL) ORDER BY type DESC",
            [locationId]
        );
        return { success: true, data: res.rows };
    } catch (error) {
        console.error('Error fetching financial accounts:', error);
        return { success: false, error: 'Failed to fetch accounts' };
    }
}

export async function getTreasuryTransactions(accountId: string): Promise<{ success: boolean; data?: TreasuryTransaction[]; error?: string }> {
    try {
        const res = await query(
            "SELECT * FROM treasury_transactions WHERE account_id = $1 ORDER BY created_at DESC LIMIT 50",
            [accountId]
        );
        return { success: true, data: res.rows };
    } catch (error) {
        return { success: false, error: 'Failed to fetch transactions' };
    }
}

/**
 * Validates and Executes a move from SAFE -> BANK (Deposit)
 */
export async function depositToBank(safeId: string, amount: number, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Validate Safe Balance
        const safeRes = await query("SELECT balance, location_id FROM financial_accounts WHERE id = $1", [safeId]);
        if (safeRes.rows.length === 0) return { success: false, error: 'Safe not found' };

        const safe = safeRes.rows[0];
        if (Number(safe.balance) < amount) {
            return { success: false, error: 'Fondos insuficientes en Caja Fuerte' };
        }

        // 2. Find Bank Account (Create dummy/placeholder if strictly needed, or just assume one exists? 
        // For now, let's look for a BANK type account for this location/company.
        // Or create a generic "Banco" transaction OUT from Safe.
        // Requirement: "Resta de Caja Fuerte -> Suma a Banco".
        // Let's assume we have a BANK account. If not, maybe create one?
        // Or maybe global bank? 
        // Let's check for a BANK account in same location first.
        let bankId: string;
        const bankRes = await query("SELECT id FROM financial_accounts WHERE location_id = $1 AND type = 'BANK'", [safe.location_id]);
        if (bankRes.rows.length === 0) {
            // Create Bank Account
            bankId = uuidv4();
            await query("INSERT INTO financial_accounts (id, location_id, name, type, balance) VALUES ($1, $2, 'Cuenta Banco', 'BANK', 0)", [bankId, safe.location_id]);
        } else {
            bankId = bankRes.rows[0].id;
        }

        // 3. Transactions
        const client = await import('@/lib/db').then(mod => mod.pool.connect()); // Manual transaction handling
        try {
            await client.query('BEGIN');

            // OUT from Safe
            await client.query("UPDATE financial_accounts SET balance = balance - $1 WHERE id = $2", [amount, safeId]);
            await client.query(`
                INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
                VALUES ($1, $2, $3, 'OUT', 'Depósito Bancario', $4)
            `, [uuidv4(), safeId, amount, userId]);

            // IN to Bank
            await client.query("UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2", [amount, bankId]);
            await client.query(`
                INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
                VALUES ($1, $2, $3, 'IN', 'Depósito desde Caja Fuerte', $4)
            `, [uuidv4(), bankId, amount, userId]);

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        revalidatePath('/finance/treasury');
        return { success: true };

    } catch (error) {
        console.error('Deposit error:', error);
        return { success: false, error: 'Error processing deposit' };
    }
}


/**
 * Generic Fund Transfer between Accounts
 */
export async function transferFunds(
    fromId: string,
    toId: string,
    amount: number,
    description: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (amount <= 0) return { success: false, error: 'Monto inválido' };

        // 1. Validate Source
        const sourceRes = await query("SELECT balance FROM financial_accounts WHERE id = $1", [fromId]);
        if (sourceRes.rows.length === 0) return { success: false, error: 'Cuenta origen no encontrada' };
        if (Number(sourceRes.rows[0].balance) < amount) return { success: false, error: 'Fondos insuficientes' };

        // 2. Validate Destination
        const destRes = await query("SELECT id FROM financial_accounts WHERE id = $1", [toId]);
        if (destRes.rows.length === 0) return { success: false, error: 'Cuenta destino no encontrada' };

        // 3. Execute Transfer
        const client = await import('@/lib/db').then(mod => mod.pool.connect());
        try {
            await client.query('BEGIN');

            // Debit Source
            await client.query("UPDATE financial_accounts SET balance = balance - $1 WHERE id = $2", [amount, fromId]);
            await client.query(`
                INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
                VALUES ($1, $2, $3, 'OUT', $4, $5)
            `, [uuidv4(), fromId, amount, description || 'Transferencia Saliente', userId]);

            // Credit Destination
            await client.query("UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2", [amount, toId]);
            await client.query(`
                INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
                VALUES ($1, $2, $3, 'IN', $4, $5)
            `, [uuidv4(), toId, amount, description || 'Transferencia Entrante', userId]);

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        revalidatePath('/finance/treasury');
        return { success: true };

    } catch (error) {
        console.error('Transfer error:', error);
        return { success: false, error: 'Error procesando transferencia' };
    }
}

export interface Remittance {
    id: string;
    location_id: string;
    source_terminal_id: string;
    amount: number;
    status: 'PENDING_RECEIPT' | 'RECEIVED';
    created_at: Date;
    created_by: string;
    received_by?: string;
}

// ... existing code ...

export async function createRemittance(
    locationId: string,
    terminalId: string,
    amount: number,
    userId: string
): Promise<boolean> {
    try {
        await query(`
            INSERT INTO treasury_remittances (
                id, location_id, source_terminal_id, amount, status, created_by, created_at
            ) VALUES ($1, $2, $3, $4, 'PENDING_RECEIPT', $5, NOW())
        `, [uuidv4(), locationId, terminalId, amount, userId]);
        return true;
    } catch (e) {
        console.error('Error creating remittance:', e);
        return false;
    }
}

export async function getPendingRemittances(locationId: string): Promise<{ success: boolean; data?: Remittance[]; error?: string }> {
    try {
        const res = await query(
            "SELECT * FROM treasury_remittances WHERE location_id = $1 AND status = 'PENDING_RECEIPT' ORDER BY created_at ASC",
            [locationId]
        );
        return { success: true, data: res.rows };
    } catch (error) {
        return { success: false, error: 'Failed to fetch remittances' };
    }
}

export async function confirmRemittance(remittanceId: string, managerId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Fetch Remittance
        const remRes = await query("SELECT * FROM treasury_remittances WHERE id = $1", [remittanceId]);
        if (remRes.rowCount === 0) return { success: false, error: 'Remittance not found' };

        const remittance = remRes.rows[0];
        if (remittance.status !== 'PENDING_RECEIPT') return { success: false, error: 'Already processed' };

        // 2. Transaction: Update Remittance Status AND Deposit to Safe
        const client = await import('@/lib/db').then(mod => mod.pool.connect());
        try {
            await client.query('BEGIN');

            // Find Safe
            const safeRes = await client.query("SELECT id FROM financial_accounts WHERE location_id = $1 AND type = 'SAFE'", [remittance.location_id]);
            if (safeRes.rowCount === 0) throw new Error('Safe not found');
            const safeId = safeRes.rows[0].id;

            // Ingest to Safe
            await client.query("UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2", [remittance.amount, safeId]);
            await client.query(`
                INSERT INTO treasury_transactions (id, account_id, amount, type, description, related_entity_id, created_by)
                VALUES ($1, $2, $3, 'IN', 'Ingreso por Remesa', $4, $5)
            `, [uuidv4(), safeId, remittance.amount, remittance.id, managerId]);

            // Update Remittance
            await client.query(`
                UPDATE treasury_remittances 
                SET status = 'RECEIVED', received_by = $1, updated_at = NOW() 
                WHERE id = $2
            `, [managerId, remittanceId]);

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        revalidatePath('/finance/treasury');
        return { success: true };
    } catch (error: any) {
        console.error('Confirm Remittance Error:', error);
        return { success: false, error: error.message || 'Error confirming remittance' };
    }
}

/**
 * Internal helper to record automatic entries (e.g. from Terminal Close)
 * @deprecated Use createRemittance instead for Custody Chain
 */
export async function recordAutoTreasuryEntry(locationId: string, amount: number, description: string, relatedEntityId?: string) {
    try {
        // Find Safe
        const safeRes = await query("SELECT id FROM financial_accounts WHERE location_id = $1 AND type = 'SAFE'", [locationId]);
        if (safeRes.rowCount === 0) {
            console.error(`No Safe found for location ${locationId}`);
            return false;
        }
        const safeId = safeRes.rows[0].id;

        // Update Balance & Insert Transaction
        await query("UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2", [amount, safeId]);
        await query(`
            INSERT INTO treasury_transactions (id, account_id, amount, type, description, related_entity_id)
            VALUES ($1, $2, $3, 'IN', $4, $5)
        `, [uuidv4(), safeId, amount, 'IN', description, relatedEntityId]);

        return true;
    } catch (e) {
        console.error('Auto Treasury Entry Failed:', e);
        return false;
    }
}

export interface RemittanceHistoryItem extends Remittance {
    location_name?: string;
    terminal_name?: string;
    cashier_name?: string;
    receiver_name?: string;
    shift_start?: Date;
    shift_end?: Date;
    cash_count_diff?: number;
    notes?: string;
}

export async function getRemittanceHistory(locationId?: string): Promise<{ success: boolean; data?: RemittanceHistoryItem[]; error?: string }> {
    try {
        let queryStr = `
            SELECT 
                r.*,
                l.name as location_name,
                t.name as terminal_name,
                u1."fullName" as cashier_name,
                u2."fullName" as receiver_name
            FROM treasury_remittances r
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN terminals t ON r.source_terminal_id = t.id
            LEFT JOIN users u1 ON r.created_by = u1.id
            LEFT JOIN users u2 ON r.received_by = u2.id
        `;

        const params: any[] = [];
        if (locationId) {
            queryStr += " WHERE r.location_id = $1";
            params.push(locationId);
        }

        queryStr += " ORDER BY r.created_at DESC LIMIT 100";

        const res = await query(queryStr, params);
        return { success: true, data: res.rows };
    } catch (error) {
        console.error('Error fetching remittance history:', error);
        return { success: false, error: 'Failed to fetch history' };
    }
}
