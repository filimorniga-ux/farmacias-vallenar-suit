'use server';

/**
 * FINANCE-CLOSING-V2: Secure Monthly Closing Module (manual, itemized)
 * - Movements are captured manually per category with date/description
 * - Aggregates are recalculated server-side on every write
 * - GERENTE_GENERAL PIN to close, ADMIN PIN to reopen
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

const UUIDSchema = z.string().uuid('ID inválido');
const MonthSchema = z.number().int().min(1).max(12);
const YearSchema = z.number().int().min(2020).max(2100);
const GERENTE_ROLES = ['GERENTE_GENERAL', 'ADMIN'];
const ADMIN_ROLES = ['ADMIN'];

const ENTRY_CATEGORIES = {
    CASH: { direction: 'IN', label: 'Efectivo recaudado' },
    TRANSFER_IN: { direction: 'IN', label: 'Transferencias recibidas' },
    CARD_INSTALLMENT: { direction: 'IN', label: 'Abonos ventas con tarjeta' },
    DAILY_EXPENSE: { direction: 'OUT', label: 'Gastos diarios' },
    TRANSFER_OUT: { direction: 'OUT', label: 'Transferencias realizadas' },
    PAYROLL: { direction: 'OUT', label: 'Pago de nóminas' },
    FIXED_EXPENSE: { direction: 'OUT', label: 'Gastos fijos' },
    TAX: { direction: 'OUT', label: 'Impuestos' },
    OWNER_WITHDRAWAL: { direction: 'OUT', label: 'Retiros del dueño' },
} as const;

type EntryCategory = keyof typeof ENTRY_CATEGORIES;

const EntryCategorySchema = z.enum(Object.keys(ENTRY_CATEGORIES) as [EntryCategory, ...EntryCategory[]]);

const DraftSchema = z.object({
    month: MonthSchema,
    year: YearSchema,
    notes: z.string().max(1000).optional(),
    userId: UUIDSchema,
});

const EntrySchema = z.object({
    month: MonthSchema,
    year: YearSchema,
    category: EntryCategorySchema,
    referenceDate: z.string().min(10, 'Fecha requerida'),
    amount: z.number().positive('Monto debe ser mayor a 0'),
    description: z.string().max(200).optional(),
    userId: UUIDSchema,
});

const ExecuteClosingSchema = z.object({
    month: MonthSchema,
    year: YearSchema,
    gerentePin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN debe ser numérico'),
});

const ReopenPeriodSchema = z.object({
    month: MonthSchema,
    year: YearSchema,
    adminPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN de ADMIN requerido'),
    reason: z.string().min(20, 'Justificación mínimo 20 caracteres'),
});

type RawEntryRow = {
    category: EntryCategory;
    amount: number;
};

type Totals = {
    incomes: { cash: number; transfer: number; card: number; total: number };
    expenses: {
        daily: number;
        transferOut: number;
        payroll: number;
        fixed: number;
        tax: number;
        owner: number;
        total: number;
    };
    netResult: number;
};

async function validatePin(client: any, pin: string, roles: string[]) {
    const bcrypt = await import('bcryptjs');
    const users = await client.query(
        `SELECT id, name, role, access_pin_hash, access_pin FROM users WHERE role = ANY($1::text[]) AND is_active = true`,
        [roles],
    );
    for (const user of users.rows) {
        if (user.access_pin_hash && (await bcrypt.compare(pin, user.access_pin_hash))) {
            return { valid: true, user: { id: user.id, name: user.name, role: user.role } };
        }
    }
    return { valid: false, error: 'PIN inválido' };
}

function normalizeDate(value: string) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Fecha inválida');
    }
    return parsed;
}

function computeTotals(rows: RawEntryRow[]): { breakdown: Record<string, number>; summary: Totals } {
    const breakdown = {
        cash: 0,
        transfer: 0,
        card: 0,
        daily: 0,
        transferOut: 0,
        payroll: 0,
        fixed: 0,
        tax: 0,
        owner: 0,
    };

    for (const row of rows) {
        const amount = Number(row.amount || 0);
        switch (row.category) {
            case 'CASH':
                breakdown.cash += amount;
                break;
            case 'TRANSFER_IN':
                breakdown.transfer += amount;
                break;
            case 'CARD_INSTALLMENT':
                breakdown.card += amount;
                break;
            case 'DAILY_EXPENSE':
                breakdown.daily += amount;
                break;
            case 'TRANSFER_OUT':
                breakdown.transferOut += amount;
                break;
            case 'PAYROLL':
                breakdown.payroll += amount;
                break;
            case 'FIXED_EXPENSE':
                breakdown.fixed += amount;
                break;
            case 'TAX':
                breakdown.tax += amount;
                break;
            case 'OWNER_WITHDRAWAL':
                breakdown.owner += amount;
                break;
            default:
                break;
        }
    }

    const totalIncome = breakdown.cash + breakdown.transfer + breakdown.card;
    const totalExpenses =
        breakdown.daily + breakdown.transferOut + breakdown.payroll + breakdown.fixed + breakdown.tax + breakdown.owner;

    return {
        breakdown,
        summary: {
            incomes: {
                cash: breakdown.cash,
                transfer: breakdown.transfer,
                card: breakdown.card,
                total: totalIncome,
            },
            expenses: {
                daily: breakdown.daily,
                transferOut: breakdown.transferOut,
                payroll: breakdown.payroll,
                fixed: breakdown.fixed,
                tax: breakdown.tax,
                owner: breakdown.owner,
                total: totalExpenses,
            },
            netResult: totalIncome - totalExpenses,
        },
    };
}

async function recalcAndPersist(
    client: any,
    month: number,
    year: number,
    options?: {
        notes?: string;
        status?: 'DRAFT' | 'CLOSED';
        closedBy?: string | null;
        closedAt?: Date | null;
        reopenReason?: string | null;
        reopenedBy?: string | null;
        reopenedAt?: Date | null;
    },
) {
    const entries = await client.query(`SELECT category, amount FROM monthly_closing_entries WHERE month = $1 AND year = $2`, [
        month,
        year,
    ]);
    const { breakdown, summary } = computeTotals(entries.rows);

    const existing = await client.query(
        `SELECT id, status, notes, social_security_cost, closed_by, closed_at, reopen_reason, reopened_by, reopened_at 
         FROM monthly_closings WHERE month = $1 AND year = $2`,
        [month, year],
    );

    const existingRow = existing.rows[0];
    const id = existingRow?.id || randomUUID();
    const status = options?.status || existingRow?.status || 'DRAFT';
    const notes = options?.notes !== undefined ? options.notes : existingRow?.notes || '';
    const closedBy = options?.closedBy ?? existingRow?.closed_by ?? null;
    const closedAt = options?.closedAt ?? existingRow?.closed_at ?? null;
    const reopenReason = options?.reopenReason ?? existingRow?.reopen_reason ?? null;
    const reopenedBy = options?.reopenedBy ?? existingRow?.reopened_by ?? null;
    const reopenedAt = options?.reopenedAt ?? existingRow?.reopened_at ?? null;

    // Preserve social_security_cost if it exists and wasn't explicitly changed (it's often handled by a different flow)
    const socialSecurityCost = existingRow?.social_security_cost || 0;

    await client.query(
        `
        INSERT INTO monthly_closings (
            id, month, year, real_cash_income, real_bank_income, fixed_expenses, variable_expenses, payroll_cost,
            social_security_cost, tax_cost, status, notes, updated_at, closed_by, closed_at, reopen_reason, reopened_by, reopened_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, $15, $16, $17)
        ON CONFLICT (month, year) DO UPDATE SET
            real_cash_income = $4,
            real_bank_income = $5,
            fixed_expenses = $6,
            variable_expenses = $7,
            payroll_cost = $8,
            social_security_cost = EXCLUDED.social_security_cost,
            tax_cost = $10,
            status = $11,
            notes = $12,
            updated_at = NOW(),
            closed_by = COALESCE($13, monthly_closings.closed_by),
            closed_at = COALESCE($14, monthly_closings.closed_at),
            reopen_reason = COALESCE($15, monthly_closings.reopen_reason),
            reopened_by = COALESCE($16, monthly_closings.reopened_by),
            reopened_at = COALESCE($17, monthly_closings.reopened_at);
        `,
        [
            id,
            month,
            year,
            breakdown.cash,
            breakdown.transfer + breakdown.card,
            breakdown.fixed,
            breakdown.daily + breakdown.transferOut + breakdown.owner,
            breakdown.payroll,
            socialSecurityCost,
            breakdown.tax,
            status,
            notes,
            closedBy,
            closedAt,
            reopenReason,
            reopenedBy,
            reopenedAt,
        ],
    );

    return { summary, status, notes };
}

function ensureDateBelongsToPeriod(date: Date, month: number, year: number) {
    if (date.getUTCMonth() + 1 !== month || date.getUTCFullYear() !== year) {
        throw new Error('La fecha debe corresponder al mes y año seleccionados');
    }
}

export async function addClosingEntry(data: z.infer<typeof EntrySchema>) {
    const validated = EntrySchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const refDate = normalizeDate(validated.data.referenceDate);
        ensureDateBelongsToPeriod(refDate, validated.data.month, validated.data.year);

        const statusCheck = await client.query(
            `SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE`,
            [validated.data.month, validated.data.year],
        );

        if (statusCheck.rows.length > 0 && statusCheck.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período cerrado. Reabra para editar.' };
        }

        // Duplication check: prevent same amount, category, date and description within 1 minute
        const duplicateCheck = await client.query(
            `SELECT id FROM monthly_closing_entries 
             WHERE month = $1 AND year = $2 AND category = $3 AND amount = $4 AND reference_date = $5 
             AND (description = $6 OR (description IS NULL AND $6 IS NULL))
             AND created_at > NOW() - INTERVAL '1 minute'`,
            [
                validated.data.month,
                validated.data.year,
                validated.data.category,
                validated.data.amount,
                refDate,
                validated.data.description || null,
            ],
        );

        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Movimiento duplicado detectado. Espere un momento.' };
        }

        await client.query(
            `
            INSERT INTO monthly_closing_entries (month, year, direction, category, description, reference_date, amount, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
                validated.data.month,
                validated.data.year,
                ENTRY_CATEGORIES[validated.data.category].direction,
                validated.data.category,
                validated.data.description || null,
                refDate,
                validated.data.amount,
                validated.data.userId,
            ],
        );

        await recalcAndPersist(client, validated.data.month, validated.data.year);
        await client.query(
            `INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
             VALUES ($1, 'CLOSING_ENTRY_ADDED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [
                validated.data.userId,
                `${validated.data.year}-${validated.data.month}`,
                JSON.stringify({
                    category: validated.data.category,
                    amount: validated.data.amount,
                    date: validated.data.referenceDate,
                }),
            ],
        );

        await client.query('COMMIT');
        revalidatePath('/finance/monthly-closing');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function deleteClosingEntry(entryId: string, month: number, year: number, userId: string) {
    if (!entryId || !userId) return { success: false, error: 'Parámetros inválidos' };
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const statusCheck = await client.query(
            `SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE`,
            [month, year],
        );
        if (statusCheck.rows.length > 0 && statusCheck.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período cerrado. Reabra para editar.' };
        }

        const deleted = await client.query(
            `DELETE FROM monthly_closing_entries WHERE id = $1 AND month = $2 AND year = $3 RETURNING id`,
            [entryId, month, year],
        );
        if (deleted.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Movimiento no encontrado' };
        }

        await recalcAndPersist(client, month, year);
        await client.query(
            `INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, created_at)
             VALUES ($1, 'CLOSING_ENTRY_REMOVED', 'MONTHLY_CLOSING', $2, NOW())`,
            [userId, `${year}-${month}`],
        );

        await client.query('COMMIT');
        revalidatePath('/finance/monthly-closing');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function initiateClosingSecure(data: z.infer<typeof DraftSchema>) {
    const validated = DraftSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const existing = await client.query(
            `SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE`,
            [validated.data.month, validated.data.year],
        );

        if (existing.rows.length > 0 && existing.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período ya cerrado. Reabra para editar.' };
        }

        await recalcAndPersist(client, validated.data.month, validated.data.year, {
            notes: validated.data.notes || '',
            status: 'DRAFT',
        });

        await client.query(
            `INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
             VALUES ($1, 'CLOSING_DRAFT_SAVED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [
                validated.data.userId,
                `${validated.data.year}-${validated.data.month}`,
                JSON.stringify({ month: validated.data.month, year: validated.data.year }),
            ],
        );

        await client.query('COMMIT');
        revalidatePath('/finance/monthly-closing');
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

        const period = await client.query(
            'SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE NOWAIT',
            [validated.data.month, validated.data.year],
        );

        if (period.rows.length > 0 && period.rows[0].status === 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período ya está cerrado' };
        }

        const entriesCount = await client.query(
            'SELECT COUNT(*)::int as count FROM monthly_closing_entries WHERE month = $1 AND year = $2',
            [validated.data.month, validated.data.year],
        );

        if (entriesCount.rows[0]?.count === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Agregue movimientos antes de cerrar el mes.' };
        }

        const pinCheck = await validatePin(client, validated.data.gerentePin, GERENTE_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinCheck.error };
        }

        await recalcAndPersist(client, validated.data.month, validated.data.year, {
            status: 'CLOSED',
            closedBy: pinCheck.user!.id,
            closedAt: new Date(),
        });

        await client.query(
            `INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
             VALUES ($1, 'MONTHLY_CLOSING_EXECUTED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [
                pinCheck.user!.id,
                `${validated.data.year}-${validated.data.month}`,
                JSON.stringify({
                    month: validated.data.month,
                    year: validated.data.year,
                    closed_by: pinCheck.user!.name,
                }),
            ],
        );

        await client.query('COMMIT');
        revalidatePath('/finance/monthly-closing');
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

        const pinCheck = await validatePin(client, validated.data.adminPin, ADMIN_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo ADMIN puede reabrir períodos' };
        }

        const period = await client.query(
            'SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE',
            [validated.data.month, validated.data.year],
        );

        if (period.rows.length === 0 || period.rows[0].status !== 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Período no está cerrado' };
        }

        await recalcAndPersist(client, validated.data.month, validated.data.year, {
            status: 'DRAFT',
            reopenReason: validated.data.reason,
            reopenedBy: pinCheck.user!.id,
            reopenedAt: new Date(),
            closedAt: null,
            closedBy: null,
        });

        await client.query(
            `INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) 
             VALUES ($1, 'PERIOD_REOPENED', 'MONTHLY_CLOSING', $2, $3::jsonb, NOW())`,
            [
                pinCheck.user!.id,
                `${validated.data.year}-${validated.data.month}`,
                JSON.stringify({ reason: validated.data.reason, admin: pinCheck.user!.name }),
            ],
        );

        await client.query('COMMIT');
        revalidatePath('/finance/monthly-closing');
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
        const [closing, entries] = await Promise.all([
            pool.query('SELECT * FROM monthly_closings WHERE month = $1 AND year = $2', [month, year]),
            pool.query(
                `SELECT e.*, u.name as created_by_name
                 FROM monthly_closing_entries e
                 LEFT JOIN users u ON u.id = e.created_by::text
                 WHERE e.month = $1 AND e.year = $2
                 ORDER BY e.reference_date DESC, e.created_at DESC`,
                [month, year],
            ),
        ]);

        const grouped: Record<EntryCategory, any[]> = Object.keys(ENTRY_CATEGORIES).reduce(
            (acc, key) => ({ ...acc, [key]: [] }),
            {} as Record<EntryCategory, any[]>,
        );

        entries.rows.forEach((row: any) => {
            grouped[row.category as EntryCategory].push({
                id: row.id,
                category: row.category,
                description: row.description,
                reference_date: row.reference_date,
                amount: Number(row.amount || 0),
                direction: row.direction,
                created_by_name: row.created_by_name || 'N/D',
                created_at: row.created_at,
            });
        });

        const { summary } = computeTotals(
            entries.rows.map((r: any) => ({ category: r.category, amount: Number(r.amount || 0) })),
        );

        const base = closing.rows[0] || { status: 'DRAFT', notes: '' };

        return {
            success: true,
            data: {
                month,
                year,
                status: base.status,
                notes: base.notes || '',
                updated_at: base.updated_at || null,
                closed_at: base.closed_at || null,
                reopen_reason: base.reopen_reason || null,
                entries: grouped,
                totals: summary,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getClosingReport(month: number, year: number) {
    try {
        const entries = await pool.query(
            `SELECT category, amount FROM monthly_closing_entries WHERE month = $1 AND year = $2`,
            [month, year],
        );
        if (entries.rowCount === 0) return { success: false, error: 'Período no encontrado' };

        const { summary } = computeTotals(
            entries.rows.map((r: any) => ({ category: r.category, amount: Number(r.amount || 0) })),
        );

        return {
            success: true,
            data: {
                month,
                year,
                totals: summary,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
