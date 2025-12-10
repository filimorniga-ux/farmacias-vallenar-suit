'use server';

import { query } from '@/lib/db';

// --- Types ---

export interface CashFlowEntry {
    id: string;
    timestamp: number;
    description: string;
    category: 'SALE' | 'EXPENSE' | 'INCOME' | 'WITHDRAWAL';
    amount_in: number;
    amount_out: number;
    balance: number; // Running balance (calculated on frontend usually, or DB window function)
    user_name?: string;
}

export interface TaxSummary {
    period: string; // "MM-YYYY"
    total_net_sales: number;
    total_vat_debit: number; // IVA Ventas to pay
    total_net_purchases: number;
    total_vat_credit: number; // IVA Compras to deduct
    estimated_tax_payment: number;
}

export interface InventoryValuation {
    warehouse_id: string;
    total_items: number;
    total_cost_value: number; // Costo Hundido
    total_sales_value: number; // Valor Venta Potencial
    potential_gross_margin: number;
    top_products: {
        name: string;
        sku: string;
        quantity: number;
        cost_value: number;
        sales_value: number;
        rotation_index?: number; // Simulated
    }[];
}

export interface PayrollPreview {
    employee_id: string;
    rut: string;
    name: string;
    job_title: string;
    base_salary: number; // Bruto
    deductions: {
        afp: number;
        health: number;
        tax: number; // Impuesto Unico (Simulated)
    };
    bonuses: number;
    total_liquid: number;
}

// --- Actions ---

/**
 * 💰 Cash Flow Ledger
 * Unions Sales (IN) and Cash Movements (IN/OUT)
 */
// ... (previous code)
export async function getCashFlowLedger(startDateStr?: string, endDateStr?: string, locationId?: string): Promise<CashFlowEntry[]> {
    try {
        // Use ISO strings for robust PG querying
        const endDateObj = endDateStr ? new Date(endDateStr) : new Date();
        if (endDateStr) endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const startDate = startDateObj.toISOString();
        const endDate = endDateObj.toISOString();

        console.log(`📊 [Back-Report] Request: Range [${startDate} - ${endDate}], Loc: ${locationId || 'ALL'}`);

        const params: any[] = [startDate, endDate];
        let locFilterSale = '';
        let locFilterCash = '';

        if (locationId) {
            locFilterSale = `AND s.location_id = $3::uuid`;
            locFilterCash = `AND cm.location_id = $3::uuid`;
            params.push(locationId);
        }

        // UNION Query
        // Includes ALL sales regardless of DTE Status
        // Added casting for timestamps ensuring string inputs work
        const sql = `
            SELECT 
                s.id::text as id,
                extract(epoch from s.timestamp) * 1000 as timestamp,
                'Venta Boleta/Factura' as description,
                'SALE' as category,
                s.total_amount as amount_in,
                0 as amount_out,
                u.name as user_name
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locFilterSale}

            UNION ALL

            SELECT 
                cm.id::text as id,
                extract(epoch from cm.timestamp) * 1000 as timestamp,
                cm.reason as description,
                CASE 
                    WHEN cm.type IN ('OPENING', 'EXTRA_INCOME', 'IN') THEN 'INCOME'
                    ELSE 'EXPENSE'
                END as category,
                CASE 
                    WHEN cm.type IN ('OPENING', 'EXTRA_INCOME', 'IN') THEN cm.amount
                    ELSE 0
                END as amount_in,
                CASE 
                    WHEN cm.type NOT IN ('OPENING', 'EXTRA_INCOME', 'IN') THEN cm.amount
                    ELSE 0
                END as amount_out,
                u.name as user_name
            FROM cash_movements cm
            LEFT JOIN users u ON cm.user_id::text = u.id::text
            WHERE cm.timestamp >= $1::timestamp AND cm.timestamp <= $2::timestamp ${locFilterCash}

            ORDER BY timestamp DESC
            LIMIT 500
        `;

        const res = await query(sql, params);
        console.log(`✅ [Back-Report] Found ${res.rowCount} rows.`);

        return res.rows.map(row => ({
            id: row.id,
            timestamp: Number(row.timestamp),
            description: row.description,
            category: row.category,
            amount_in: Number(row.amount_in),
            amount_out: Number(row.amount_out),
            balance: 0,
            user_name: row.user_name || 'Sistema'
        }));

    } catch (error) {
        console.error('Error fetching cash flow:', error);
        return [];
    }
}

/**
 * ⚖️ Tax Summary (F29 Simulator)
 * Approximates VAT based on Sales and Purchase Orders
 */
export async function getTaxSummary(monthArg?: string): Promise<TaxSummary> {
    try {
        // monthArg format: "YYYY-MM"
        const now = new Date();
        const startOfMonth = monthArg ? new Date(`${monthArg}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);

        const startIso = startOfMonth.toISOString();
        const endIso = endOfMonth.toISOString();

        console.log(`📊 [Back-Tax] Period: ${startIso} to ${endIso}`);

        // 1. Get Totals Sales (Gross)
        const salesRes = await query(`
            SELECT SUM(total_amount) as total 
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
        `, [startIso, endIso]);

        const grossSales = Number(salesRes.rows[0].total) || 0;
        const netSales = Math.round(grossSales / 1.19);
        const vatDebit = grossSales - netSales;

        // 2. Get Total Purchases (Gross) from Purchase Orders with status RECEIVED
        // Note: This relies on PO having 'total_estimated' or summing items.
        // We'll trust purchase_orders.total_estimated for now.
        // Optimization: Check if table exists first or Wrap in try/catch specifically for this query
        let grossPurchases = 0;
        try {
            const purchasesRes = await query(`
                SELECT SUM(total_estimated) as total 
                FROM purchase_orders 
                WHERE status = 'RECEIVED' 
                AND received_at >= $1::timestamp AND received_at <= $2::timestamp
            `, [startIso, endIso]);
            grossPurchases = Number(purchasesRes.rows[0].total) || 0;
        } catch (e) {
            console.warn('⚠️ purchase_orders table likely missing, skipping purchases tax calc.');
        }

        const netPurchases = Math.round(grossPurchases / 1.19);
        const vatCredit = grossPurchases - netPurchases;

        return {
            period: startOfMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
            total_net_sales: netSales,
            total_vat_debit: vatDebit,
            total_net_purchases: netPurchases,
            total_vat_credit: vatCredit,
            estimated_tax_payment: Math.max(0, vatDebit - vatCredit)
        };

    } catch (error) {
        console.error('Error calculating tax:', error);
        return {
            period: 'Error',
            total_net_sales: 0,
            total_vat_debit: 0,
            total_net_purchases: 0,
            total_vat_credit: 0,
            estimated_tax_payment: 0
        };
    }
}

/**
 * 🚚 Inventory Valuation
 */
export async function getInventoryValuation(warehouseId?: string): Promise<InventoryValuation> {
    try {
        // We aggregate inventory_batches
        // unit_cost comes from 'cost_price' in product usually, or batch.
        // sale_price from batch or product.

        // This query joins batches with products to ensure we have pricing
        const sql = `
            SELECT 
                COUNT(*) as total_batches,
                SUM(ib.quantity_real) as total_units,
                -- Fallback: If cost is 0, assume 60% of sale price as cost to avoid $0 valuation
                SUM(ib.quantity_real * CASE 
                    WHEN COALESCE(ib.unit_cost, p.cost_price, 0) > 0 THEN COALESCE(ib.unit_cost, p.cost_price)
                    WHEN COALESCE(ib.sale_price, p.sale_price, 0) > 0 THEN COALESCE(ib.sale_price, p.sale_price) * 0.6
                    ELSE 0 
                END) as total_cost,
                SUM(ib.quantity_real * COALESCE(ib.sale_price, p.sale_price, 0)) as total_sale
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            WHERE ib.quantity_real > 0
            ${warehouseId ? "AND ib.warehouse_id::text = $1" : ""}
        `;

        const params = warehouseId ? [warehouseId] : [];
        const aggRes = await query(sql, params);
        const totals = aggRes.rows[0];

        // Top 20 High Value Items
        const topSql = `
            SELECT 
                p.nombre as name,
                p.id as sku, -- using id/sku mix
                SUM(ib.quantity_real) as quantity,
                MAX(COALESCE(ib.unit_cost, p.cost_price, 0)) as unit_cost,
                MAX(COALESCE(ib.sale_price, p.sale_price, 0)) as unit_price
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            WHERE ib.quantity_real > 0
            ${warehouseId ? "AND ib.warehouse_id::text = $1" : ""}
            GROUP BY p.id, p.nombre
            ORDER BY (SUM(ib.quantity_real) * MAX(COALESCE(ib.sale_price, p.sale_price, 0))) DESC
            LIMIT 20
        `;

        const topRes = await query(topSql, params);

        const topProducts = topRes.rows.map(row => ({
            name: row.name,
            sku: row.sku?.toString(),
            quantity: Number(row.quantity),
            cost_value: Number(row.quantity) * Number(row.unit_cost),
            sales_value: Number(row.quantity) * Number(row.unit_price)
        }));

        return {
            warehouse_id: warehouseId || 'ALL',
            total_items: Number(totals.total_units) || 0,
            total_cost_value: Number(totals.total_cost) || 0,
            total_sales_value: Number(totals.total_sale) || 0,
            potential_gross_margin: (Number(totals.total_sale) || 0) - (Number(totals.total_cost) || 0),
            top_products: topProducts
        };

    } catch (error) {
        console.error('Error fetching inventory valuation:', error);
        return {
            warehouse_id: 'ERROR',
            total_items: 0,
            total_cost_value: 0,
            total_sales_value: 0,
            potential_gross_margin: 0,
            top_products: []
        };
    }
}

/**
 * 👥 HR Payroll Preview
 */
export async function getPayrollPreview(): Promise<PayrollPreview[]> {
    try {
        // Fetch active users with salary info
        const sql = `
            SELECT id, rut, name, job_title, base_salary, afp, health_system 
            FROM users 
            WHERE status = 'ACTIVE'
            ORDER BY name ASC
        `;
        const res = await query(sql);

        return res.rows.map(user => {
            const base = Number(user.base_salary) || 460000; // Fallback to min wage

            // Simulation Logic
            const afpRate = 0.11; // ~11%
            const healthRate = 0.07; // 7%

            const afpAmount = Math.round(base * afpRate);
            const healthAmount = Math.round(base * healthRate);
            const liquid = base - afpAmount - healthAmount;

            return {
                employee_id: user.id,
                rut: user.rut,
                name: user.name,
                job_title: user.job_title || 'Empleado',
                base_salary: base,
                deductions: {
                    afp: afpAmount,
                    health: healthAmount,
                    tax: 0 // Simplification
                },
                bonuses: 0,
                total_liquid: liquid
            };
        });

    } catch (error) {
        console.error('Error fetching payroll:', error);
        return [];
    }
}

/**
 * 📊 Detailed Financial KPI Summary
 * Returns categorized totals for Cards
 */
export async function getDetailedFinancialSummary(startDateStr: string, endDateStr: string): Promise<{
    total_sales: number;
    total_payroll: number;
    total_social_security: number;
    total_operational_expenses: number;
    net_income: number;
}> {
    try {
        const endDateObj = endDateStr ? new Date(endDateStr) : new Date();
        if (endDateStr) endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const startDate = startDateObj.toISOString();
        const endDate = endDateObj.toISOString();
        const params = [startDate, endDate];

        // 1. Sales
        const salesRes = await query(`
            SELECT SUM(total_amount) as total 
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
        `, params);
        const totalSales = Number(salesRes.rows[0].total) || 0;

        // 2. Expenses (Categorized by LIKE on reason)
        const expensesRes = await query(`
            SELECT reason, amount 
            FROM cash_movements 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp 
            AND type = 'OUT'
        `, params);

        let payroll = 0;
        let socialSecurity = 0;
        let operational = 0;

        expensesRes.rows.forEach(row => {
            const r = (row.reason || '').toUpperCase();
            const amt = Number(row.amount) || 0;

            if (r.includes('PAYROLL') || r.includes('NOMINA') || r.includes('SUELDO')) {
                payroll += amt;
            } else if (r.includes('SOCIAL_SECURITY') || r.includes('LEYES SOCIALES') || r.includes('PREVISION')) {
                socialSecurity += amt;
            } else {
                operational += amt;
            }
        });

        return {
            total_sales: totalSales,
            total_payroll: payroll,
            total_social_security: socialSecurity,
            total_operational_expenses: operational,
            net_income: totalSales - (payroll + socialSecurity + operational)
        };

    } catch (error) {
        console.error('Error fetching financial summary:', error);
        return {
            total_sales: 0,
            total_payroll: 0,
            total_social_security: 0,
            total_operational_expenses: 0,
            net_income: 0
        };
    }
}

/**
 * 📦 Logistics KPIs
 */
export interface LogisticsKPIs {
    total_in: number;
    total_out: number;
    last_movement: string;
}

/**
 * 📦 Logistics KPIs
 */
export async function getLogisticsKPIs(startDateStr: string, endDateStr: string, warehouseId?: string): Promise<LogisticsKPIs> {
    try {
        const endDateObj = endDateStr ? new Date(endDateStr) : new Date();
        if (endDateStr) endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const params: any[] = [startDateObj.toISOString(), endDateObj.toISOString()];
        let locFilter = "";

        if (warehouseId) {
            locFilter = "AND location_id::text = $3";
            params.push(warehouseId);
        }

        const sql = `
            SELECT 
                COUNT(*) FILTER (WHERE movement_type IN ('PURCHASE_RECEIPT', 'TRANSFER_IN', 'RETURN')) as total_in,
                COUNT(*) FILTER (WHERE movement_type IN ('TRANSFER_OUT', 'DISPATCH', 'ADJUSTMENT_NEG')) as total_out,
                MAX(timestamp) as last_movement
            FROM stock_movements
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
            ${locFilter}
        `;

        const res = await query(sql, params);
        const row = res.rows[0];

        return {
            total_in: Number(row.total_in) || 0,
            total_out: Number(row.total_out) || 0,
            last_movement: row.last_movement ? new Date(row.last_movement).toLocaleString('es-CL') : 'Sin movimiento'
        };

    } catch (error) {
        console.error('Error fetching Logistics KPIs:', error);
        return { total_in: 0, total_out: 0, last_movement: '-' };
    }
}

/**
 * 🕵️‍♂️ Drill-Down: Detailed Stock Movements
 */
export async function getStockMovementsDetail(
    type: 'IN' | 'OUT' | 'ALL',
    startDateStr: string,
    endDateStr: string,
    warehouseId?: string
) {
    try {
        const endDateObj = endDateStr ? new Date(endDateStr) : new Date();
        if (endDateStr) endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const params: any[] = [startDateObj.toISOString(), endDateObj.toISOString()];
        let queryStr = `
            SELECT 
                sm.id,
                sm.timestamp,
                sm.movement_type,
                sm.quantity,
                sm.product_name,
                sm.sku,
                u.name as user_name,
                sm.notes as reason
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id::text = u.id::text
            WHERE sm.timestamp >= $1::timestamp AND sm.timestamp <= $2::timestamp
        `;

        // Filter by Type
        if (type === 'IN') {
            queryStr += ` AND sm.movement_type IN ('PURCHASE_RECEIPT', 'TRANSFER_IN', 'RETURN', 'ADJUSTMENT_POS')`;
        } else if (type === 'OUT') {
            queryStr += ` AND sm.movement_type IN ('TRANSFER_OUT', 'DISPATCH', 'ADJUSTMENT_NEG', 'LOSS', 'SALE')`;
        }

        // Filter by Warehouse
        if (warehouseId) {
            queryStr += ` AND sm.location_id::text = $3`;
            params.push(warehouseId);
        }

        queryStr += ` ORDER BY sm.timestamp DESC LIMIT 100`;

        const res = await query(queryStr, params);

        return res.rows.map(row => {
            let destination = '-';
            // Semantic Parsing for specific movement types
            if (row.movement_type === 'TRANSFER_OUT') {
                // Try to extract destination from specific known formats like "Transfer to UUID"
                // Since we don't have the Name map easily effectively without a join, we utilize the Note content but format it.
                // Ideally, we would join. For now, returned formatted note.
                if (row.reason && row.reason.includes('Transfer to')) {
                    destination = 'Destino Configurado en Nota'; // Placeholder or keep note
                }
            } else if (row.movement_type === 'TRANSFER_IN') {
                if (row.reason && row.reason.includes('Transfer from')) {
                    destination = 'Origen Configurado en Nota';
                }
            }

            return {
                id: row.id,
                timestamp: row.timestamp,
                type: row.movement_type,
                product: row.product_name || row.sku,
                quantity: Math.abs(Number(row.quantity)),
                user: row.user_name || 'Sistema',
                reason: row.reason || '-',
                // We return raw reason as 'destination' relative context for now, or the user can just view 'reason'.
                // The prompt asks for a Specific Column. Let's rely on 'reason' being shown in that column if no parsed value.
                location_context: row.reason // Use this for the new column
            };
        });

    } catch (error) {
        console.error('Error fetching movement detail:', error);
        return [];
    }
}

