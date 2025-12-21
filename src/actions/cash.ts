'use server';

import { query } from '@/lib/db';
import { CashMovement, Expense } from '@/domain/types';
import { revalidatePath } from 'next/cache';
import { isValidUUID } from '@/lib/utils';

/**
 * Creates a generic cash movement (Withdrawal, Opening, Closing, Extra Income)
 */
export async function createCashMovement(movement: Omit<CashMovement, 'id'>) {
    try {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();

        // Map Domain (IN/OUT + Reason) to DB Enum (EXPENSE, WITHDRAWAL, etc.)
        let dbType = 'WITHDRAWAL';
        const type = movement.type as string;
        const reason = movement.reason as string;

        if (type === 'IN') {
            if (reason === 'INITIAL_FUND') dbType = 'OPENING';
            else dbType = 'EXTRA_INCOME';
        } else { // OUT
            if (reason === 'WITHDRAWAL') dbType = 'WITHDRAWAL';
            else if (reason === 'CHANGE') dbType = 'WITHDRAWAL'; // Or similar
            else if (reason === 'SUPPLIES' || reason === 'SERVICES') dbType = 'EXPENSE';
            else if (dbType === 'CLOSING') dbType = 'CLOSING'; // If passed as reason? Not standard.
            else dbType = 'WITHDRAWAL'; // Default OUT
        }

        const sql = `
            INSERT INTO cash_movements (
                id, location_id, user_id, type, amount, reason, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
        `;

        const values = [
            id,
            isValidUUID(movement.shift_id) ? movement.shift_id : null,
            isValidUUID(movement.user_id) ? movement.user_id : null,
            dbType,
            movement.amount,
            movement.description,
            movement.timestamp
        ];

        await query(sql, values);

        revalidatePath('/caja');
        return { success: true, id };
    } catch (error) {
        console.error('❌ Error creating cash movement:', error);
        return { success: false, error: 'Database error' };
    }
}

/**
 * Creates an Expense
 */
export async function createExpense(expense: Omit<Expense, 'id'>) {
    try {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();

        const sql = `
            INSERT INTO cash_movements (
                id, location_id, user_id, type, amount, reason, timestamp
            ) VALUES ($1, $2, $3, 'EXPENSE', $4, $5, to_timestamp($6 / 1000.0))
        `;

        const values = [
            id,
            null,
            null,
            expense.amount,
            `${expense.category}: ${expense.description}`,
            expense.date
        ];

        await query(sql, values);
        revalidatePath('/caja');
        return { success: true, id };
    } catch (error) {
        console.error('❌ Error creating expense:', error);
        return { success: false, error: 'Database error' };
    }
}

export async function getCashMovements(terminalId?: string, limit = 50) {
    try {
        let sql = `SELECT * FROM cash_movements WHERE 1=1 `;
        const params: any[] = [];

        if (terminalId && isValidUUID(terminalId)) {
            sql += `AND location_id = $${params.length + 1} `;
            params.push(terminalId);
        }

        sql += `ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await query(sql, params);

        return res.rows.map((row: any) => {
            const dbType = row.type;
            let type: 'IN' | 'OUT' = 'OUT';
            let reason: any = 'OTHER';

            switch (dbType) {
                case 'OPENING': type = 'IN'; reason = 'INITIAL_FUND'; break;
                case 'EXTRA_INCOME': type = 'IN'; reason = 'OTHER_INCOME'; break;
                case 'WITHDRAWAL': type = 'OUT'; reason = 'WITHDRAWAL'; break;
                case 'EXPENSE': type = 'OUT'; reason = 'SUPPLIES'; break; // Default expense reason
                case 'CLOSING': type = 'OUT'; reason = 'OTHER'; break; // Usually closing is just a log, but if money moves out -> OUT
                default: type = 'OUT'; reason = 'OTHER';
            }

            return {
                id: row.id.toString(),
                type,
                amount: Number(row.amount),
                description: row.reason || '',
                reason,
                timestamp: new Date(row.timestamp).getTime(),
                user_id: row.user_id?.toString() || '',
                shift_id: row.location_id?.toString() || '',
                is_cash: true
            };
        });
    } catch (error: any) {
        if (error.code === '42P01') {
            console.warn('⚠️ Cash Movements table missing. Auto-creating...');
            try {
                await query(`
                    CREATE TABLE IF NOT EXISTS cash_movements (
                        id UUID PRIMARY KEY,
                        location_id UUID, 
                        user_id UUID,
                        type VARCHAR(50),
                        amount NUMERIC(15, 2),
                        reason TEXT,
                        timestamp TIMESTAMP,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                `);
                return [];
            } catch (createError) {
                console.error('❌ Failed to create cash_movements table:', createError);
                return [];
            }
        }
        console.error('Error fetching cash movements:', error);
        return [];
    }
}

// Helpers
// Helper removed (use shared in @/lib/utils)

function mapDbTypeToDomain(dbType: string): any {
    // Deprecated by inline map
    return 'OUT';
}
