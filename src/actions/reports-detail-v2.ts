'use server';

/**
 * ============================================================================
 * REPORTS-DETAIL-V2: Reportes Financieros Seguros
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC por tipo de reporte
 * - PIN ADMIN para nómina (datos sensibles)
 * - Auditoría de acceso
 * - Caché de 10 minutos
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const DateRangeSchema = z.object({
    startDate: z.string(),
    endDate: z.string(),
});

// ============================================================================
// TYPES
// ============================================================================

export interface CashFlowEntry {
    id: string;
    timestamp: number;
    description: string;
    category: string;
    amount_in: number;
    amount_out: number;
    user_name?: string;
}

export interface TaxSummary {
    period: string;
    total_net_sales: number;
    total_vat_debit: number;
    total_net_purchases: number;
    total_vat_credit: number;
    estimated_tax_payment: number;
}

export interface InventoryValuation {
    warehouse_id: string;
    total_items: number;
    total_cost_value: number;
    total_sales_value: number;
    potential_gross_margin: number;
    top_products: { name: string; sku?: string; quantity: number; cost_value: number; sales_value: number }[];
}

export interface PayrollPreview {
    employee_id: string;
    rut: string;
    name: string;
    job_title: string;
    base_salary: number;
    deductions: { afp: number; health: number; tax: number };
    bonuses: number;
    total_liquid: number;
}

export interface LogisticsKPIs {
    total_in: number;
    total_out: number;
    last_movement?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const ACCOUNTING_ROLES = ['CONTADOR', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'];

// Caché de reportes
const reportCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// ============================================================================
// HELPERS
// ============================================================================



function getCacheKey(type: string, params: any): string {
    return `report:${type}:${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
    const entry = reportCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        reportCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: any): void {
    reportCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function validateAdminPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; admin?: { id: string; name: string } }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const adminsRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [ADMIN_ROLES]);

        for (const admin of adminsRes.rows) {
            const rateCheck = checkRateLimit(admin.id);
            if (!rateCheck.allowed) continue;

            if (admin.access_pin_hash) {
                const valid = await bcrypt.compare(pin, admin.access_pin_hash);
                if (valid) {
                    resetAttempts(admin.id);
                    return { valid: true, admin: { id: admin.id, name: admin.name } };
                }
                recordFailedAttempt(admin.id);
            } else if (admin.access_pin === pin) {
                resetAttempts(admin.id);
                return { valid: true, admin: { id: admin.id, name: admin.name } };
            }
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

async function auditReportAccess(userId: string, reportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'REPORT_ACCESS', 'REPORT', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ report_type: reportType, ...params })]);
    } catch {
        // Silent fail for audit
    }
}

// ============================================================================
// CASH FLOW LEDGER
// ============================================================================

/**
 * 💰 Libro de Flujo de Caja (MANAGER+)
 */
export async function getCashFlowLedgerSecure(
    params: { startDate?: string; endDate?: string; locationId?: string }
): Promise<{ success: boolean; data?: CashFlowEntry[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Solo managers pueden ver flujo de caja.' };
    }

    // Filtrar por ubicación si no es admin
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    // Verificar caché
    const cacheKey = getCacheKey('cashflow', { ...params, locationId });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const endDate = params.endDate ? new Date(params.endDate) : new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = params.startDate ? new Date(params.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const queryParams: any[] = [startDate.toISOString(), endDate.toISOString()];
        let locFilterSale = '';
        let locFilterCash = '';

        if (locationId) {
            locFilterSale = `AND s.location_id = $3::uuid`;
            locFilterCash = `AND cm.location_id = $3::uuid`;
            queryParams.push(locationId);
        }

        const sql = `
            SELECT id::text, timestamp, description, category, amount_in, amount_out, user_name
            FROM (
                SELECT 
                    s.id, extract(epoch from s.timestamp) * 1000 as timestamp,
                    'Venta' as description, 'SALE' as category,
                    s.total_amount as amount_in, 0 as amount_out, u.name as user_name
                FROM sales s
                LEFT JOIN users u ON s.user_id::text = u.id::text
                WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locFilterSale}
                
                UNION ALL
                
                SELECT 
                    cm.id, extract(epoch from cm.timestamp) * 1000 as timestamp,
                    cm.reason as description,
                    CASE WHEN cm.type IN ('OPENING', 'EXTRA_INCOME') THEN 'INCOME' ELSE 'EXPENSE' END,
                    CASE WHEN cm.type IN ('OPENING', 'EXTRA_INCOME') THEN cm.amount ELSE 0 END,
                    CASE WHEN cm.type NOT IN ('OPENING', 'EXTRA_INCOME') THEN cm.amount ELSE 0 END,
                    u.name
                FROM cash_movements cm
                LEFT JOIN users u ON cm.user_id::text = u.id::text
                WHERE cm.timestamp >= $1::timestamp AND cm.timestamp <= $2::timestamp ${locFilterCash}
            ) combined
            ORDER BY timestamp DESC
            LIMIT 500
        `;

        const res = await query(sql, queryParams);
        const data = res.rows.map((row: any) => ({
            id: row.id,
            timestamp: Number(row.timestamp),
            description: row.description,
            category: row.category,
            amount_in: Number(row.amount_in),
            amount_out: Number(row.amount_out),
            user_name: row.user_name || 'Sistema',
        }));

        // Cachear
        setCache(cacheKey, data);

        // Auditar
        await auditReportAccess(session.userId, 'CASH_FLOW', { locationId });

        logger.info({ userId: session.userId, rows: data.length }, '💰 [Reports] Cash flow accessed');
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Cash flow error');
        return { success: false, error: 'Error obteniendo flujo de caja' };
    }
}

// ============================================================================
// TAX SUMMARY
// ============================================================================

/**
 * ⚖️ Resumen Fiscal (ADMIN/CONTADOR)
 */
export async function getTaxSummarySecure(
    month?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ACCOUNTING_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Solo contadores y administradores.' };
    }

    // Verificar caché
    const cacheKey = getCacheKey('tax', { month });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const now = new Date();
        const startOfMonth = month ? new Date(`${month}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);

        // Ventas
        const salesRes = await query(`
            SELECT SUM(total_amount) as total FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
        `, [startOfMonth.toISOString(), endOfMonth.toISOString()]);

        const grossSales = Number(salesRes.rows[0]?.total) || 0;
        const netSales = Math.round(grossSales / 1.19);
        const vatDebit = grossSales - netSales;

        // Compras
        let grossPurchases = 0;
        try {
            const purchasesRes = await query(`
                SELECT SUM(total_estimated) as total 
                FROM purchase_orders 
                WHERE status = 'RECEIVED' 
                AND received_at >= $1::timestamp AND received_at <= $2::timestamp
            `, [startOfMonth.toISOString(), endOfMonth.toISOString()]);
            grossPurchases = Number(purchasesRes.rows[0]?.total) || 0;
        } catch {
            // Tabla puede no existir
        }

        const netPurchases = Math.round(grossPurchases / 1.19);
        const vatCredit = grossPurchases - netPurchases;

        const data = {
            period: startOfMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
            total_net_sales: netSales,
            total_vat_debit: vatDebit,
            total_net_purchases: netPurchases,
            total_vat_credit: vatCredit,
            estimated_tax_payment: Math.max(0, vatDebit - vatCredit),
        };

        setCache(cacheKey, data);
        await auditReportAccess(session.userId, 'TAX_SUMMARY', { month });

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Tax summary error');
        return { success: false, error: 'Error obteniendo resumen fiscal' };
    }
}

// ============================================================================
// INVENTORY VALUATION
// ============================================================================

/**
 * 📦 Valorización de Inventario (MANAGER+)
 */
export async function getInventoryValuationSecure(
    warehouseId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    // Filtrar por ubicación
    const filterWarehouseId = warehouseId || session.locationId;

    const cacheKey = getCacheKey('inventory', { warehouseId: filterWarehouseId });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const params = filterWarehouseId ? [filterWarehouseId] : [];
        const warehouseFilter = filterWarehouseId ? 'AND ib.warehouse_id::text = $1' : '';

        const aggRes = await query(`
            SELECT 
                COUNT(*) as total_batches,
                SUM(ib.quantity_real) as total_units,
                SUM(ib.quantity_real * COALESCE(ib.unit_cost, p.cost_price, 0)) as total_cost,
                SUM(ib.quantity_real * COALESCE(ib.sale_price, p.sale_price, 0)) as total_sale
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            WHERE ib.quantity_real > 0 ${warehouseFilter}
        `, params);

        const totals = aggRes.rows[0];

        const data = {
            warehouse_id: filterWarehouseId || 'ALL',
            total_items: Number(totals.total_units) || 0,
            total_cost_value: Number(totals.total_cost) || 0,
            total_sales_value: Number(totals.total_sale) || 0,
            potential_gross_margin: (Number(totals.total_sale) || 0) - (Number(totals.total_cost) || 0),
        };

        setCache(cacheKey, data);
        await auditReportAccess(session.userId, 'INVENTORY_VALUATION', { warehouseId: filterWarehouseId });

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Inventory valuation error');
        return { success: false, error: 'Error obteniendo valorización' };
    }
}

// ============================================================================
// PAYROLL PREVIEW - REQUIERE PIN ADMIN
// ============================================================================

/**
 * 👥 Preview de Nómina (ADMIN + PIN OBLIGATORIO)
 */
export async function getPayrollPreviewSecure(
    month: number,
    year: number,
    adminPin: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden ver nómina' };
    }

    if (!adminPin) {
        return { success: false, error: 'Se requiere PIN de administrador para acceder a datos de nómina' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // Obtener datos de nómina
        const res = await client.query(`
            SELECT id, rut, name, job_title, base_salary, afp, health_system 
            FROM users 
            WHERE status = 'ACTIVE'
            ORDER BY name ASC
        `);

        const data = res.rows.map((user: any) => {
            const base = Number(user.base_salary) || 460000;
            const afpAmount = Math.round(base * 0.11);
            const healthAmount = Math.round(base * 0.07);
            const liquid = base - afpAmount - healthAmount;

            return {
                employee_id: user.id,
                rut: user.rut,
                name: user.name,
                job_title: user.job_title || 'Empleado',
                base_salary: base,
                deductions: { afp: afpAmount, health: healthAmount, tax: 0 },
                bonuses: 0,
                total_liquid: liquid,
            };
        });

        // Auditar acceso a nómina
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'PAYROLL_ACCESS', 'PAYROLL', $2::jsonb, NOW())
        `, [authResult.admin!.id, JSON.stringify({
            month,
            year,
            employees_count: data.length,
            accessed_by: authResult.admin!.name,
        })]);

        await client.query('COMMIT');

        logger.info({ adminId: authResult.admin!.id, month, year }, '👥 [Reports] Payroll accessed');
        return { success: true, data };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Reports] Payroll error');
        return { success: false, error: 'Error obteniendo nómina' };
    } finally {
        client.release();
    }
}

// ============================================================================
// FINANCIAL SUMMARY
// ============================================================================

/**
 * Financial Summary Interface
 */
export interface FinancialSummary {
    total_sales: number;
    total_payroll: number;
    total_social_security: number;
    total_operational_expenses: number;
    net_income: number;
}

/**
 * Stock Movement Detail Interface
 */
export interface StockMovementDetail {
    id: string;
    timestamp: Date;
    type: string;
    product: string;
    quantity: number;
    user: string;
    reason: string;
    location_context?: string;
}

/**
 * 📊 Resumen Financiero Detallado (MANAGER+)
 */
export async function getDetailedFinancialSummarySecure(
    startDate: string,
    endDate: string
): Promise<{ success: boolean; data?: FinancialSummary; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Requiere permisos de manager.' };
    }

    try {
        const endDateObj = endDate ? new Date(endDate) : new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const params = [startDateObj.toISOString(), endDateObj.toISOString()];

        // 1. Sales
        const salesRes = await query(`
            SELECT SUM(total_amount) as total 
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
        `, params);
        const totalSales = Number(salesRes.rows[0]?.total) || 0;

        // 2. Expenses (Categorized by LIKE on reason)
        const expensesRes = await query(`
            SELECT reason, amount 
            FROM cash_movements 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp 
            AND (type = 'OUT' OR type IN ('WITHDRAWAL', 'EXPENSE', 'CLOSING'))
        `, params);

        let payroll = 0;
        let socialSecurity = 0;
        let operational = 0;

        expensesRes.rows.forEach((row: any) => {
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

        const data: FinancialSummary = {
            total_sales: totalSales,
            total_payroll: payroll,
            total_social_security: socialSecurity,
            total_operational_expenses: operational,
            net_income: totalSales - (payroll + socialSecurity + operational)
        };

        // Auditar acceso
        await auditReportAccess(session.userId, 'FINANCIAL_SUMMARY', { startDate, endDate });

        logger.info({ userId: session.userId }, '📊 [Reports] Financial summary accessed');
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Financial summary error');
        return { success: false, error: 'Error obteniendo resumen financiero' };
    }
}

// ============================================================================
// LOGISTICS KPIs
// ============================================================================

/**
 * 📦 KPIs Logísticos (MANAGER+)
 */
export async function getLogisticsKPIsSecure(
    startDate: string,
    endDate: string,
    warehouseId?: string
): Promise<{ success: boolean; data?: LogisticsKPIs; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Requiere permisos de manager.' };
    }

    try {
        const endDateObj = endDate ? new Date(endDate) : new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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

        const data: LogisticsKPIs = {
            total_in: Number(row?.total_in) || 0,
            total_out: Number(row?.total_out) || 0,
            last_movement: row?.last_movement ? new Date(row.last_movement).toLocaleString('es-CL') : 'Sin movimiento'
        };

        // Auditar acceso
        await auditReportAccess(session.userId, 'LOGISTICS_KPIS', { startDate, endDate, warehouseId });

        logger.info({ userId: session.userId }, '📦 [Reports] Logistics KPIs accessed');
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Logistics KPIs error');
        return { success: false, error: 'Error obteniendo KPIs logísticos' };
    }
}

// ============================================================================
// STOCK MOVEMENTS DETAIL
// ============================================================================

/**
 * 🕵️ Detalle de Movimientos de Stock (MANAGER+)
 */
export async function getStockMovementsDetailSecure(
    type: 'IN' | 'OUT' | 'ALL',
    startDate: string,
    endDate: string,
    warehouseId?: string
): Promise<{ success: boolean; data?: StockMovementDetail[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Requiere permisos de manager.' };
    }

    try {
        const endDateObj = endDate ? new Date(endDate) : new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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
            queryStr += ` AND (
                sm.movement_type IN ('PURCHASE_RECEIPT', 'TRANSFER_IN', 'RETURN', 'ADJUSTMENT_POS', 'RECEIPT', 'PURCHASE_ENTRY', 'INITIAL')
                OR (sm.movement_type = 'ADJUSTMENT' AND sm.quantity > 0)
            )`;
        } else if (type === 'OUT') {
            queryStr += ` AND (
                sm.movement_type IN ('TRANSFER_OUT', 'DISPATCH', 'ADJUSTMENT_NEG', 'LOSS', 'SALE')
                OR (sm.movement_type = 'ADJUSTMENT' AND sm.quantity < 0)
            )`;
        }

        // Filter by Warehouse
        if (warehouseId) {
            queryStr += ` AND sm.location_id::text = $3`;
            params.push(warehouseId);
        }

        queryStr += ` ORDER BY sm.timestamp DESC LIMIT 100`;

        const res = await query(queryStr, params);

        const data: StockMovementDetail[] = res.rows.map((row: any) => ({
            id: row.id,
            timestamp: row.timestamp,
            type: row.movement_type,
            product: row.product_name || row.sku,
            quantity: Math.abs(Number(row.quantity)),
            user: row.user_name || 'Sistema',
            reason: row.reason || '-',
            location_context: row.reason
        }));

        // Auditar acceso
        await auditReportAccess(session.userId, 'STOCK_MOVEMENTS', { type, startDate, endDate, warehouseId });

        logger.info({ userId: session.userId, count: data.length }, '🕵️ [Reports] Stock movements accessed');
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Stock movements error');
        return { success: false, error: 'Error obteniendo movimientos de stock' };
    }
}

