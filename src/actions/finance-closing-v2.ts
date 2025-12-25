'use server';

/**
 * FINANCE-CLOSING-V2: Secure Monthly Closing Module
 * Pharma-Synapse v3.1 - Security Hardened
 * 
 * SECURITY: SERIALIZABLE, GERENTE_GENERAL PIN for closing, ADMIN for reopen
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

const UUIDSchema = z.string().uuid('ID inválido');
const GERENTE_ROLES = ['GERENTE_GENERAL', 'ADMIN'];
const ADMIN_ROLES = ['ADMIN'];

const ClosingDataSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    realCashIncome: z.number().min(0),
    realBankIncome: z.number().min(0),
    fixedExpenses: z.number().min(0),
    variableExpenses: z.number().min(0),
    payrollCost: z.number().min(0),
    socialSecurityCost: z.number().min(0),
    taxCost: z.number().min(0),
    notes: z.string().max(1000).optional(),
    userId: UUIDSchema,
});

const ExecuteClosingSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    gerentePin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN debe ser numérico'),
});

const ReopenPeriodSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    adminPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN de ADMIN requerido'),
    reason: z.string().min(20, 'Justificación mínimo 20 caracteres'),
});

async function validatePin(client: any, pin: string, roles: string[]) {
    const bcrypt = await import('bcryptjs');
    const users = await client.query(`SELECT id, name, role, access_pin_hash, access_pin FROM users WHERE role = ANY($1::text[]) AND is_active = true`, [roles]);
    for (const user of users.rows) {
        if (user.access_pin_hash && await bcrypt.compare(pin, user.access_pin_hash)) {
            return { valid: true, user: { id: user.id, name: user.name, role: user.role } };
        }
    }
    return { valid: false, error: 'PIN inválido' };
}

export async function initiateClosingSecure(data: z.infer<typeof ClosingDataSchema>) {
    const validated = ClosingDataSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Check if already closed
        const existing = await client.query('SELECT status FROM monthly_closings WHERE month = $1 AND year = $2', [validated.data.month, validated.data.year]);
        if (existing.rows.length > 0 && existing.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período ya está cerrado. Requiere reapertura.' };
        }

        const id = randomUUID();
        await client.query(`
            INSERT INTO monthly_closings (id, month, year, real_cash_income, real_bank_income, fixed_expenses, variable_expenses, payroll_cost, social_security_cost, tax_cost, status, notes, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11, NOW())
            ON CONFLICT (month, year) DO UPDATE SET
                real_cash_income = EXCLUDED.real_cash_income, real_bank_income = EXCLUDED.real_bank_income,
                fixed_expenses = EXCLUDED.fixed_expenses, variable_expenses = EXCLUDED.variable_expenses,
                payroll_cost = EXCLUDED.payroll_cost, social_security_cost = EXCLUDED.social_security_cost,
                tax_cost = EXCLUDED.tax_cost, notes = EXCLUDED.notes, updated_at = NOW()
        `, [id, validated.data.month, validated.data.year, validated.data.realCashIncome, validated.data.realBankIncome,
            validated.data.fixedExpenses, validated.data.variableExpenses, validated.data.payrollCost,
            validated.data.socialSecurityCost, validated.data.taxCost, validated.data.notes]);

        await client.query(`INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
            VALUES ($1, 'CLOSING_DRAFT_SAVED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [validated.data.userId, `${validated.data.year}-${validated.data.month}`, JSON.stringify({ month: validated.data.month, year: validated.data.year })]);

        await client.query('COMMIT');
        revalidatePath('/finance');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function executeClosingSecure(data: z.infer<typeof ExecuteClosingSchema>) {
    const validated = ExecuteClosingSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verify period exists and is DRAFT
        const period = await client.query('SELECT * FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE NOWAIT',
            [validated.data.month, validated.data.year]);

        if (period.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay datos para cerrar. Guarde primero.' };
        }
        if (period.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período ya está cerrado' };
        }

        // Validate GERENTE_GENERAL PIN
        const pinCheck = await validatePin(client, validated.data.gerentePin, GERENTE_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinCheck.error };
        }

        // Execute closing
        await client.query(`UPDATE monthly_closings SET status = 'CLOSED', closed_by = $1, closed_at = NOW(), updated_at = NOW() WHERE month = $2 AND year = $3`,
            [pinCheck.user!.id, validated.data.month, validated.data.year]);

        await client.query(`INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
            VALUES ($1, 'MONTHLY_CLOSING_EXECUTED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [pinCheck.user!.id, `${validated.data.year}-${validated.data.month}`,
            JSON.stringify({ month: validated.data.month, year: validated.data.year, closed_by: pinCheck.user!.name })]);

        await client.query('COMMIT');
        revalidatePath('/finance');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        if (e.code === '55P03') return { success: false, error: 'Período está siendo procesado' };
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function reopenPeriodSecure(data: z.infer<typeof ReopenPeriodSchema>) {
    const validated = ReopenPeriodSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validate ADMIN PIN
        const pinCheck = await validatePin(client, validated.data.adminPin, ADMIN_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo ADMIN puede reabrir períodos' };
        }

        // Verify period is closed
        const period = await client.query('SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE',
            [validated.data.month, validated.data.year]);

        if (period.rows.length === 0 || period.rows[0].status !== 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período no está cerrado' };
        }

        // Reopen
        await client.query(`UPDATE monthly_closings SET status = 'DRAFT', reopened_by = $1, reopened_at = NOW(), reopen_reason = $2, updated_at = NOW() WHERE month = $3 AND year = $4`,
            [pinCheck.user!.id, validated.data.reason, validated.data.month, validated.data.year]);

        await client.query(`INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
            VALUES ($1, 'PERIOD_REOPENED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [pinCheck.user!.id, `${validated.data.year}-${validated.data.month}`,
            JSON.stringify({ reason: validated.data.reason, admin: pinCheck.user!.name })]);

        await client.query('COMMIT');
        revalidatePath('/finance');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function getClosingDataSecure(month: number, year: number) {
    try {
        const existing = await pool.query('SELECT * FROM monthly_closings WHERE month = $1 AND year = $2', [month, year]);

        // Calculate suggestions from system data
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const cashRes = await pool.query(`SELECT SUM(amount) as total FROM treasury_transactions WHERE type = 'IN' AND created_at >= $1 AND created_at <= $2`, [startDate, endDate]);
        const cardRes = await pool.query(`SELECT SUM(total) as total FROM sales WHERE payment_method IN ('DEBIT', 'CREDIT', 'TRANSFER') AND created_at >= $1 AND created_at <= $2`, [startDate, endDate]);

        const data = existing.rows.length > 0 ? existing.rows[0] : {
            month, year, real_cash_income: 0, real_bank_income: 0, fixed_expenses: 0, variable_expenses: 0,
            payroll_cost: 0, social_security_cost: 0, tax_cost: 0, status: 'DRAFT', notes: ''
        };

        data.suggested_cash = Number(cashRes.rows[0]?.total || 0);
        data.suggested_card = Number(cardRes.rows[0]?.total || 0);

        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getClosingReport(month: number, year: number) {
    try {
        const closing = await pool.query('SELECT * FROM monthly_closings WHERE month = $1 AND year = $2', [month, year]);
        if (closing.rows.length === 0) return { success: false, error: 'Período no encontrado' };

        const c = closing.rows[0];
        const totalIncome = Number(c.real_cash_income) + Number(c.real_bank_income);
        const totalExpenses = Number(c.fixed_expenses) + Number(c.variable_expenses) + Number(c.payroll_cost) + Number(c.social_security_cost) + Number(c.tax_cost);
        const netResult = totalIncome - totalExpenses;

        return {
            success: true,
            data: {
                ...c,
                total_income: totalIncome,
                total_expenses: totalExpenses,
                net_result: netResult,
                profit_margin: totalIncome > 0 ? ((netResult / totalIncome) * 100).toFixed(2) + '%' : '0%'
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
