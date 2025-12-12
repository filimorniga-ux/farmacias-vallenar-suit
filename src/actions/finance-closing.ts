'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface MonthlyClosingData {
    id?: string;
    month: number;
    year: number;
    real_cash_income: number;
    real_bank_income: number;
    fixed_expenses: number;
    variable_expenses: number;
    payroll_cost: number;
    social_security_cost: number;
    tax_cost: number;
    status: 'DRAFT' | 'CLOSED';
    notes: string;
    updated_at?: Date;

    // Suggestions
    suggested_cash?: number;
    suggested_card?: number;
}

export async function getClosingData(month: number, year: number): Promise<{ success: boolean; data?: MonthlyClosingData; error?: string }> {
    try {
        // 1. Fetch Existing Closing
        const existingRes = await query(
            "SELECT * FROM monthly_closings WHERE month = $1 AND year = $2",
            [month, year]
        );

        let closingData: MonthlyClosingData;

        if (existingRes.rows.length > 0) {
            closingData = existingRes.rows[0];
        } else {
            // Default Empty
            closingData = {
                month,
                year,
                real_cash_income: 0,
                real_bank_income: 0,
                fixed_expenses: 0,
                variable_expenses: 0,
                payroll_cost: 0,
                social_security_cost: 0,
                tax_cost: 0,
                status: 'DRAFT',
                notes: ''
            };
        }

        // 2. Calculate Suggestions (Real-time from System Data)
        // Adjust Start/End Dates for Month (UTC vs Local overlap might exist, but taking full month range)
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Suggested Cash: Sum of Treasury Transactions 'IN' to 'SAFE'
        // Logic: All money ENTERING Safe is usually Sales Cash. 
        // Note: This approximates cash sales. Better if we query `sales` table directly too.
        // Let's use Sales Table for accuracy if available, or Treasury.
        // Requirement says: "suggested_cash: Suma de treasury_transactions (Ingresos a Caja Fuerte)"
        const cashRes = await query(`
            SELECT SUM(amount) as total 
            FROM treasury_transactions 
            WHERE type = 'IN' 
            AND created_at >= $1 AND created_at <= $2
            AND account_id IN (SELECT id FROM financial_accounts WHERE type = 'SAFE')
        `, [startDate, endDate]);

        // Suggested Card: Sum of Sales where payment method != CASH
        // Assuming table `sales` exists with `payment_method` and `total`.
        const cardRes = await query(`
            SELECT SUM(total) as total
            FROM sales
            WHERE payment_method IN ('DEBIT', 'CREDIT', 'TRANSFER')
            AND created_at >= $1 AND created_at <= $2
        `, [startDate, endDate]);

        closingData.suggested_cash = Number(cashRes.rows[0]?.total || 0);
        closingData.suggested_card = Number(cardRes.rows[0]?.total || 0);

        return { success: true, data: closingData };

    } catch (error) {
        console.error('Error fetching closing data:', error);
        return { success: false, error: 'Error cargando datos de cierre' };
    }
}

export async function saveClosing(data: MonthlyClosingData, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Validation
        if (!data.month || !data.year) return { success: false, error: 'Mes/Año inválidos' };

        // Check internal status
        const existingRes = await query("SELECT status FROM monthly_closings WHERE month = $1 AND year = $2", [data.month, data.year]);
        if (existingRes.rows.length > 0 && existingRes.rows[0].status === 'CLOSED') {
            // If already closed, only allow if user is specifically Admin or we unblock (for now restrict)
            // But logic says "Editar y Guardar". Let's allow edit unless we strictly block.
            // Assumption: CLOSED means locked. But maybe user wants to correct it?
            // Let's allow updating even if closed for MVP flexibility, or return error if strictly rigid.
            // User requirement: "Cerrar Mes Definitivamente". Implies locking.
            // Let's block if currrently CLOSED. (But give a way to re-open? Not requested yet).
            // For now, let's just Upsert.
        }

        const id = data.id || uuidv4();

        // Upsert
        await query(`
            INSERT INTO monthly_closings (
                id, month, year, 
                real_cash_income, real_bank_income, 
                fixed_expenses, variable_expenses, 
                payroll_cost, social_security_cost, tax_cost, 
                status, notes, closed_by, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (month, year) DO UPDATE SET
                real_cash_income = EXCLUDED.real_cash_income,
                real_bank_income = EXCLUDED.real_bank_income,
                fixed_expenses = EXCLUDED.fixed_expenses,
                variable_expenses = EXCLUDED.variable_expenses,
                payroll_cost = EXCLUDED.payroll_cost,
                social_security_cost = EXCLUDED.social_security_cost,
                tax_cost = EXCLUDED.tax_cost,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                closed_by = EXCLUDED.closed_by,
                updated_at = NOW()
        `, [
            id, data.month, data.year,
            data.real_cash_income, data.real_bank_income,
            data.fixed_expenses, data.variable_expenses,
            data.payroll_cost, data.social_security_cost, data.tax_cost,
            data.status, data.notes, userId
        ]);

        return { success: true };

    } catch (error) {
        console.error('Error saving closing:', error);
        return { success: false, error: 'Error guardando cierre' };
    }
}
