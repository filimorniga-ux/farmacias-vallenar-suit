'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { isValidUUID } from '@/lib/utils';

export interface FinancialMetrics {
    summary: {
        total_sales: number;
        total_income_other: number;
        total_expenses: number;
        base_cash: number;
        net_cash_flow: number;
        sales_count: number;
    };
    by_payment_method: {
        cash: number;
        debit: number;
        credit: number;
        transfer: number;
        others: number;
    };
    breakdown: {
        id: string;
        name: string;
        total: number;
    }[];
}

// Helper for UUID validation
// Helper removed (use shared in @/lib/utils)

export async function getFinancialMetrics(
    dateRange: { from: Date; to: Date },
    locationId?: string,
    terminalId?: string
): Promise<FinancialMetrics> {
    try {
        const fromStr = dateRange.from.toISOString();
        const toStr = dateRange.to.toISOString();

        // 🛡️ Validate UUIDs to prevent 500 Errors
        if (locationId) {
            if (!isValidUUID(locationId)) {
                console.warn(`⚠️ Invalid Location UUID: "${locationId}". Falling back to Global View.`);
                locationId = undefined;
            }
        }
        if (terminalId) {
            if (!isValidUUID(terminalId)) {
                console.warn(`⚠️ Invalid Terminal UUID: "${terminalId}". Ignoring filter.`);
                terminalId = undefined;
            }
        }

        // 1. Base Filters
        // We use parameters array for safety (though dynamic building is needed).
        // To simplify, we'll build clauses.

        let salesWhere = "WHERE timestamp >= $1 AND timestamp <= $2";
        let cashWhere = "WHERE timestamp >= $1 AND timestamp <= $2";
        const params: any[] = [fromStr, toStr];
        let paramIndex = 3;

        // ... (rest of logic continues correctly as locationId is now safe or undefined)
        if (locationId) {
            // ...
        }


        // Correct Params Rebuild
        const queryParams = [fromStr, toStr];
        if (locationId) queryParams.push(locationId);
        if (terminalId) queryParams.push(terminalId);

        // Rebuild Where with correct indexes
        // $1=from, $2=to.
        // Location is $3. Terminal is $3 or $4.

        let salesConditions = "timestamp >= $1::timestamp AND timestamp <= $2::timestamp";
        let cashConditions = "timestamp >= $1::timestamp AND timestamp <= $2::timestamp";

        if (locationId) {
            salesConditions += ` AND location_id = $3::uuid`;
            cashConditions += ` AND terminal_id IN (SELECT id FROM terminals WHERE location_id = $3::uuid)`;
        }
        if (terminalId) {
            const idx = locationId ? '$4' : '$3';
            salesConditions += ` AND terminal_id = ${idx}::uuid`;
            cashConditions += ` AND terminal_id = ${idx}::uuid`;
        }

        // --- Execute Queries ---

        // 1. Sales Summary
        const salesSql = `
            SELECT 
                COALESCE(SUM(total_amount), 0) as total,
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END), 0) as cash,
                COALESCE(SUM(CASE WHEN payment_method = 'DEBIT' THEN total_amount ELSE 0 END), 0) as debit,
                COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' THEN total_amount ELSE 0 END), 0) as credit,
                COALESCE(SUM(CASE WHEN payment_method = 'TRANSFER' THEN total_amount ELSE 0 END), 0) as transfer
            FROM sales 
            WHERE 
                timestamp >= $1::timestamp 
                AND timestamp <= $2::timestamp 
                ${salesConditions.replace('timestamp >= $1::timestamp AND timestamp <= $2::timestamp', '')}
                -- Removed DTE Status filter to show All Sales
        `;
        const salesRes = await query(salesSql, queryParams);
        const sRow = salesRes.rows[0];

        // 2. Cash Movements Summary
        const cashSql = `
            SELECT 
                type,
                COALESCE(SUM(amount), 0) as total
            FROM cash_movements
            WHERE ${cashConditions}
            GROUP BY type
        `;
        const cashRes = await query(cashSql, queryParams);

        const cashMap = new Map<string, number>();
        cashRes.rows.forEach((r: any) => cashMap.set(r.type, parseFloat(r.total)));

        const income = (cashMap.get('INGRESO') || 0) + (cashMap.get('APERTURA') || 0); // Apertura counts as income for Flow? usually yes, it's starting cash.
        const expenses = (cashMap.get('GASTO') || 0) + (cashMap.get('RETIRO') || 0) + (cashMap.get('CIERRE') || 0); // Cierre isn't expense, it's declaration.
        // Net Cash Flow = (Apertura + Ventas Efectivo + Ingresos) - (Gastos + Retiros).
        // Cierre is just a marker.
        // We exclude CIERRE from expenses calculation.
        const realExpenses = (cashMap.get('GASTO') || 0) + (cashMap.get('RETIRO') || 0);
        const baseCash = cashMap.get('APERTURA') || 0;
        const extraIncome = cashMap.get('INGRESO') || 0;

        const salesCash = parseFloat(sRow.cash);
        const netCashFlow = (baseCash + salesCash + extraIncome) - realExpenses;

        // 3. Breakdown (By Branch or Terminal)
        // If Global View (no loc, no term) -> Group by Location
        // If Location View (loc, no term) -> Group by Terminal
        // If Terminal View -> No breakdown or hourly? Let's say hourly or user view? 
        // Request says: "Si veo Global -> Lista de Sucursales... Si veo Sucursal -> Lista de Terminales"

        let breakdownSql = "";
        let breakdownParams = [...queryParams];

        if (!locationId && !terminalId) {
            // Global -> By Location
            breakdownSql = `
                SELECT l.id, l.name, COALESCE(SUM(s.total_amount), 0) as total
                FROM locations l
                LEFT JOIN sales s ON s.location_id = l.id AND s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
                WHERE l.type = 'STORE'
                GROUP BY l.id, l.name
                ORDER BY total DESC
             `;
            // Only 2 params needed
            breakdownParams = [fromStr, toStr];
        } else if (locationId && !terminalId) {
            // Location -> By Terminal
            breakdownSql = `
                SELECT t.id, t.name, COALESCE(SUM(s.total_amount), 0) as total
                FROM terminals t
                LEFT JOIN sales s ON s.terminal_id = t.id AND s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
                WHERE t.location_id = $3::uuid
                GROUP BY t.id, t.name
                ORDER BY total DESC
             `;
        } else {
            // Terminal View -> Maybe breakdown by User? Or just empty.
            breakdownSql = `SELECT 'Sales' as name, 0 as total`; // Placeholder for now
        }

        let breakdown: any[] = [];
        if (breakdownSql.includes('FROM')) {
            const bdRes = await query(breakdownSql, breakdownParams);
            breakdown = bdRes.rows.map((r: any) => ({
                id: r.id,
                name: r.name,
                total: parseFloat(r.total)
            }));
        }

        return {
            summary: {
                total_sales: parseFloat(sRow.total),
                sales_count: parseInt(sRow.count),
                total_income_other: extraIncome,
                total_expenses: realExpenses,
                base_cash: baseCash,
                net_cash_flow: netCashFlow
            },
            by_payment_method: {
                cash: parseFloat(sRow.cash),
                debit: parseFloat(sRow.debit),
                credit: parseFloat(sRow.credit),
                transfer: parseFloat(sRow.transfer),
                others: 0
            },
            breakdown
        };

    } catch (error) {
        console.error('Error fetching financial metrics:', error);
        // Return empty safe object
        return {
            summary: { total_sales: 0, sales_count: 0, total_income_other: 0, total_expenses: 0, base_cash: 0, net_cash_flow: 0 },
            by_payment_method: { cash: 0, debit: 0, credit: 0, transfer: 0, others: 0 },
            breakdown: []
        };
    }
}
