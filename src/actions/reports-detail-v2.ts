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
import { logger } from '@/lib/logger';
import { getSessionSecure } from './auth-v2';
import {
    ensureWarehouseInLocation,
    requireReportActor,
    resolveEffectiveLocation,
    resolveLocationFromWarehouseOrLocation,
    type ReportActor,
} from './report-scope';
import {
    getActorOrFail,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';

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

export interface CriticalLowStockReportRow {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    stockMin: number;
    deficit: number;
    warehouseId?: string;
    warehouseName?: string;
    locationId?: string;
    locationName?: string;
}

export interface OpenPurchaseOrderReportRow {
    id: string;
    status: string;
    supplierName: string;
    totalAmount: number;
    createdAt?: string;
    deliveryDate?: string;
    itemCount: number;
    warehouseId?: string;
    warehouseName?: string;
    locationId?: string;
    locationName?: string;
}

export interface PendingShipmentReportRow {
    id: string;
    type: string;
    status: string;
    originLocationName?: string;
    destinationLocationName?: string;
    createdAt?: string;
    expectedDelivery?: string;
    itemCount: number;
    createdByName?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const ACCOUNTING_ROLES = ['CONTADOR', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'];
const OPERATIONS_REPORT_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF', 'WAREHOUSE', 'WAREHOUSE_CHIEF'];

// Caché de reportes
const reportCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const DrilldownFiltersSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: UUIDSchema.optional(),
    warehouseId: UUIDSchema.optional(),
    limit: z.number().int().min(1).max(200).optional().default(100),
});

const PendingShipmentKindSchema = z.enum(['TRANSFERS', 'RECEPTIONS']);

type DrilldownFilters = z.infer<typeof DrilldownFiltersSchema>;

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

function normalizeReportDateRange(startDate?: string, endDate?: string) {
    const endDateObj = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date();
    const startDateObj = startDate ? new Date(`${startDate}T00:00:00.000`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (
        Number.isNaN(startDateObj.getTime())
        || Number.isNaN(endDateObj.getTime())
        || startDateObj > endDateObj
    ) {
        return null;
    }

    return {
        startIso: startDateObj.toISOString(),
        endIso: endDateObj.toISOString(),
    };
}

async function resolveReportDrilldownScope(actor: ReportActor, filters: DrilldownFilters) {
    const baseLocationScope = resolveEffectiveLocation(actor, filters.locationId);
    if (!baseLocationScope.success) {
        return baseLocationScope;
    }

    let effectiveLocationId = baseLocationScope.locationId;
    const effectiveWarehouseId = filters.warehouseId;

    if (effectiveWarehouseId) {
        const warehouseLocationId = await resolveLocationFromWarehouseOrLocation(effectiveWarehouseId);
        if (!warehouseLocationId) {
            return { success: false as const, error: 'Bodega inválida' };
        }

        const warehouseScope = resolveEffectiveLocation(actor, warehouseLocationId);
        if (!warehouseScope.success) {
            return warehouseScope;
        }

        if (effectiveLocationId && warehouseLocationId !== effectiveLocationId) {
            return { success: false as const, error: 'La bodega no pertenece a la ubicación efectiva' };
        }

        const warehouseAllowed = await ensureWarehouseInLocation(effectiveWarehouseId, warehouseLocationId);
        if (!warehouseAllowed) {
            return { success: false as const, error: 'Bodega fuera del contexto permitido' };
        }

        effectiveLocationId = effectiveLocationId || warehouseLocationId;
    }

    return {
        success: true as const,
        locationId: effectiveLocationId,
        warehouseId: effectiveWarehouseId,
    };
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

        const locFilterRefund = locationId ? `AND r.location_id = $3::uuid` : '';

        const sql = `
            SELECT id::text, timestamp, description, category, amount_in, amount_out, user_name
            FROM (
                SELECT 
                    s.id, extract(epoch from s.timestamp) * 1000 as timestamp,
                    'Venta' as description, 'SALE' as category,
                    s.total_amount as amount_in, 0 as amount_out, u.name as user_name
                FROM sales s
                LEFT JOIN users u ON s.user_id::text = u.id::text
                WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
                AND s.status NOT IN ('VOIDED')
                ${locFilterSale}
                
                UNION ALL

                SELECT 
                    r.id, extract(epoch from r.created_at) * 1000 as timestamp,
                    'Devolución ' || COALESCE(r.ticket_number, '') as description,
                    'REFUND' as category,
                    0 as amount_in, r.total_amount as amount_out, u.name as user_name
                FROM refunds r
                LEFT JOIN users u ON r.user_id::text = u.id::text
                WHERE r.created_at >= $1::timestamp AND r.created_at <= $2::timestamp
                AND r.status = 'COMPLETED'
                ${locFilterRefund}
                
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

        // Ventas (excluyendo anuladas)
        const salesRes = await query(`
            SELECT SUM(total_amount) as total FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
            AND status NOT IN ('VOIDED')
        `, [startOfMonth.toISOString(), endOfMonth.toISOString()]);

        // Devoluciones
        let totalRefunds = 0;
        try {
            const refundsRes = await query(`
                SELECT COALESCE(SUM(total_amount), 0) as total FROM refunds
                WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
                AND status = 'COMPLETED'
            `, [startOfMonth.toISOString(), endOfMonth.toISOString()]);
            totalRefunds = Number(refundsRes.rows[0]?.total) || 0;
        } catch { /* tabla puede no existir */ }

        const grossSales = (Number(salesRes.rows[0]?.total) || 0) - totalRefunds;
        const netSales = Math.round(grossSales / 1.19);
        const vatDebit = grossSales - netSales;

        // Compras
        let grossPurchases = 0;
        try {
            const purchasesRes = await query(`
                SELECT SUM(total_amount) as total 
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
    const actorResult = await requireReportActor(MANAGER_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const actor = actorResult.actor;

    let requestedLocationId: string | undefined;
    let scopedWarehouseId: string | undefined;

    if (warehouseId) {
        requestedLocationId = await resolveLocationFromWarehouseOrLocation(warehouseId);
        if (!requestedLocationId) {
            return { success: false, error: 'Bodega o ubicación inválida' };
        }

        const warehouseScopeResult = resolveEffectiveLocation(actor, requestedLocationId);
        if (!warehouseScopeResult.success) {
            return { success: false, error: warehouseScopeResult.error };
        }

        requestedLocationId = warehouseScopeResult.locationId;

        if (requestedLocationId) {
            const warehouseExistsInLocation = await ensureWarehouseInLocation(warehouseId, requestedLocationId);
            if (warehouseExistsInLocation) {
                scopedWarehouseId = warehouseId;
            }
        }
    } else {
        const locationScopeResult = resolveEffectiveLocation(actor);
        if (!locationScopeResult.success) {
            return { success: false, error: locationScopeResult.error };
        }

        requestedLocationId = locationScopeResult.locationId;
    }

    const cacheKey = getCacheKey('inventory', {
        warehouseId: scopedWarehouseId,
        locationId: requestedLocationId,
    });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const params: string[] = [];
        let filters = '';

        if (requestedLocationId) {
            filters += ` AND w.location_id::text = $${params.length + 1}::text`;
            params.push(requestedLocationId);
        }

        if (scopedWarehouseId) {
            filters += ` AND ib.warehouse_id::text = $${params.length + 1}::text`;
            params.push(scopedWarehouseId);
        }

        const aggRes = await query(`
            SELECT 
                COUNT(*) as total_batches,
                SUM(ib.quantity_real) as total_units,
                SUM(ib.quantity_real * COALESCE(ib.unit_cost, p.cost_price, 0)) as total_cost,
                SUM(ib.quantity_real * COALESCE(ib.sale_price, p.sale_price, 0)) as total_sale
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            JOIN warehouses w ON ib.warehouse_id::text = w.id::text
            WHERE ib.quantity_real > 0 ${filters}
        `, params);

        const totals = aggRes.rows[0];

        const data = {
            warehouse_id: scopedWarehouseId || requestedLocationId || 'ALL',
            total_items: Number(totals.total_units) || 0,
            total_cost_value: Number(totals.total_cost) || 0,
            total_sales_value: Number(totals.total_sale) || 0,
            potential_gross_margin: (Number(totals.total_sale) || 0) - (Number(totals.total_cost) || 0),
        };

        setCache(cacheKey, data);
        await auditReportAccess(actor.userId, 'INVENTORY_VALUATION', {
            warehouseId: scopedWarehouseId || warehouseId,
            locationId: requestedLocationId,
        });

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Inventory valuation error');
        return { success: false, error: 'Error obteniendo valorización' };
    }
}

// ============================================================================
// OPERATIONAL DRILLDOWNS
// ============================================================================

export async function getCriticalLowStockReportSecure(
    rawFilters: Partial<DrilldownFilters> = {},
): Promise<{ success: boolean; data?: CriticalLowStockReportRow[]; error?: string }> {
    const actorResult = await requireReportActor(OPERATIONS_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const parsed = DrilldownFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Filtros inválidos' };
    }

    const scope = await resolveReportDrilldownScope(actorResult.actor, parsed.data);
    if (!scope.success) {
        return { success: false, error: scope.error };
    }

    try {
        const params: Array<string | number> = [];
        const filters: string[] = [
            'COALESCE(ib.quantity_real, 0) < COALESCE(ib.stock_min, 0)',
        ];

        if (scope.locationId) {
            params.push(scope.locationId);
            filters.push(`(ib.location_id::text = $${params.length}::text OR w.location_id::text = $${params.length}::text)`);
        }

        if (scope.warehouseId) {
            params.push(scope.warehouseId);
            filters.push(`ib.warehouse_id::text = $${params.length}::text`);
        }

        params.push(parsed.data.limit);

        const res = await query(`
            SELECT
                COALESCE(ib.product_id::text, ib.id::text) AS product_id,
                COALESCE(p.sku, ib.sku, '') AS sku,
                COALESCE(p.name, ib.name, 'Producto sin nombre') AS name,
                COALESCE(ib.quantity_real, 0) AS quantity,
                COALESCE(ib.stock_min, 0) AS stock_min,
                GREATEST(COALESCE(ib.stock_min, 0) - COALESCE(ib.quantity_real, 0), 0) AS deficit,
                ib.warehouse_id::text AS warehouse_id,
                w.name AS warehouse_name,
                COALESCE(ib.location_id::text, w.location_id::text) AS location_id,
                l.name AS location_name
            FROM inventory_batches ib
            LEFT JOIN products p ON ib.product_id::text = p.id::text
            LEFT JOIN warehouses w ON ib.warehouse_id::text = w.id::text
            LEFT JOIN locations l ON COALESCE(ib.location_id::text, w.location_id::text) = l.id::text
            WHERE ${filters.join(' AND ')}
            ORDER BY deficit DESC, name ASC
            LIMIT $${params.length}
        `, params);

        await auditReportAccess(actorResult.actor.userId, 'CRITICAL_LOW_STOCK_DRILLDOWN', {
            locationId: scope.locationId,
            warehouseId: scope.warehouseId,
        });

        return {
            success: true,
            data: res.rows.map((row) => ({
                productId: String(row.product_id || ''),
                sku: String(row.sku || ''),
                name: String(row.name || ''),
                quantity: Number(row.quantity || 0),
                stockMin: Number(row.stock_min || 0),
                deficit: Number(row.deficit || 0),
                warehouseId: row.warehouse_id ? String(row.warehouse_id) : undefined,
                warehouseName: row.warehouse_name ? String(row.warehouse_name) : undefined,
                locationId: row.location_id ? String(row.location_id) : undefined,
                locationName: row.location_name ? String(row.location_name) : undefined,
            })),
        };
    } catch (error: any) {
        logger.error({ error }, '[Reports] Critical low stock drilldown error');
        return { success: false, error: 'Error obteniendo bajo stock crítico' };
    }
}

export async function getOpenPurchaseOrdersReportSecure(
    rawFilters: Partial<DrilldownFilters> = {},
): Promise<{ success: boolean; data?: OpenPurchaseOrderReportRow[]; error?: string }> {
    const actorResult = await requireReportActor(OPERATIONS_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const parsed = DrilldownFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Filtros inválidos' };
    }

    const dateRange = normalizeReportDateRange(parsed.data.startDate, parsed.data.endDate);
    if (!dateRange) {
        return { success: false, error: 'Rango de fechas inválido' };
    }

    const scope = await resolveReportDrilldownScope(actorResult.actor, parsed.data);
    if (!scope.success) {
        return { success: false, error: scope.error };
    }

    try {
        const params: Array<string | number> = [dateRange.startIso, dateRange.endIso];
        const filters: string[] = [
            "po.status NOT IN ('RECEIVED', 'CANCELLED')",
            'po.created_at >= $1::timestamp',
            'po.created_at <= $2::timestamp',
        ];

        if (scope.locationId) {
            params.push(scope.locationId);
            filters.push(`w.location_id::text = $${params.length}::text`);
        }

        if (scope.warehouseId) {
            params.push(scope.warehouseId);
            filters.push(`po.target_warehouse_id::text = $${params.length}::text`);
        }

        params.push(parsed.data.limit);

        const res = await query(`
            SELECT
                po.id::text AS id,
                po.status,
                COALESCE(s.business_name, 'Proveedor no informado') AS supplier_name,
                COALESCE(po.total_amount, 0) AS total_amount,
                po.created_at,
                po.delivery_date,
                po.target_warehouse_id::text AS warehouse_id,
                w.name AS warehouse_name,
                w.location_id::text AS location_id,
                l.name AS location_name,
                COUNT(poi.id) AS item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id::text = s.id::text
            LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
            LEFT JOIN locations l ON w.location_id::text = l.id::text
            LEFT JOIN purchase_order_items poi ON poi.purchase_order_id::text = po.id::text
            WHERE ${filters.join(' AND ')}
            GROUP BY po.id, s.business_name, w.name, w.location_id, l.name
            ORDER BY po.created_at DESC
            LIMIT $${params.length}
        `, params);

        await auditReportAccess(actorResult.actor.userId, 'OPEN_PURCHASE_ORDERS_DRILLDOWN', {
            locationId: scope.locationId,
            warehouseId: scope.warehouseId,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
        });

        return {
            success: true,
            data: res.rows.map((row) => ({
                id: String(row.id || ''),
                status: String(row.status || 'UNKNOWN'),
                supplierName: String(row.supplier_name || 'Proveedor no informado'),
                totalAmount: Number(row.total_amount || 0),
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                deliveryDate: row.delivery_date ? new Date(row.delivery_date).toISOString() : undefined,
                itemCount: Number(row.item_count || 0),
                warehouseId: row.warehouse_id ? String(row.warehouse_id) : undefined,
                warehouseName: row.warehouse_name ? String(row.warehouse_name) : undefined,
                locationId: row.location_id ? String(row.location_id) : undefined,
                locationName: row.location_name ? String(row.location_name) : undefined,
            })),
        };
    } catch (error: any) {
        logger.error({ error }, '[Reports] Open purchase orders drilldown error');
        return { success: false, error: 'Error obteniendo órdenes de compra abiertas' };
    }
}

export async function getPendingShipmentsReportSecure(
    kind: z.infer<typeof PendingShipmentKindSchema>,
    rawFilters: Partial<DrilldownFilters> = {},
): Promise<{ success: boolean; data?: PendingShipmentReportRow[]; error?: string }> {
    const actorResult = await requireReportActor(OPERATIONS_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const kindParsed = PendingShipmentKindSchema.safeParse(kind);
    if (!kindParsed.success) {
        return { success: false, error: 'Tipo de shipment inválido' };
    }

    const parsed = DrilldownFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Filtros inválidos' };
    }

    const dateRange = normalizeReportDateRange(parsed.data.startDate, parsed.data.endDate);
    if (!dateRange) {
        return { success: false, error: 'Rango de fechas inválido' };
    }

    const scope = await resolveReportDrilldownScope(actorResult.actor, parsed.data);
    if (!scope.success) {
        return { success: false, error: scope.error };
    }

    try {
        const params: Array<string | number> = [dateRange.startIso, dateRange.endIso];
        const filters: string[] = [
            "s.status IN ('PENDING', 'IN_TRANSIT')",
            's.created_at >= $1::timestamp',
            's.created_at <= $2::timestamp',
        ];

        if (kindParsed.data === 'TRANSFERS') {
            filters.push("s.type = 'INTER_BRANCH'");
        } else {
            filters.push("s.type IN ('INBOUND', 'INBOUND_PROVIDER')");
        }

        if (scope.locationId) {
            params.push(scope.locationId);
            filters.push(`(s.origin_location_id::text = $${params.length}::text OR s.destination_location_id::text = $${params.length}::text)`);
        }

        if (scope.warehouseId) {
            params.push(scope.warehouseId);
            filters.push(`(s.origin_warehouse_id::text = $${params.length}::text OR s.target_warehouse_id::text = $${params.length}::text)`);
        }

        params.push(parsed.data.limit);

        const res = await query(`
            SELECT
                s.id::text AS id,
                s.type,
                s.status,
                s.created_at,
                NULL::timestamp AS expected_delivery,
                ol.name AS origin_location_name,
                dl.name AS destination_location_name,
                u.name AS created_by_name,
                COUNT(si.id) AS item_count
            FROM shipments s
            LEFT JOIN locations ol ON s.origin_location_id::text = ol.id::text
            LEFT JOIN locations dl ON s.destination_location_id::text = dl.id::text
            LEFT JOIN users u ON s.created_by::text = u.id::text
            LEFT JOIN shipment_items si ON si.shipment_id::text = s.id::text
            WHERE ${filters.join(' AND ')}
            GROUP BY s.id, ol.name, dl.name, u.name
            ORDER BY s.created_at DESC
            LIMIT $${params.length}
        `, params);

        await auditReportAccess(actorResult.actor.userId, 'PENDING_SHIPMENTS_DRILLDOWN', {
            kind: kindParsed.data,
            locationId: scope.locationId,
            warehouseId: scope.warehouseId,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
        });

        return {
            success: true,
            data: res.rows.map((row) => ({
                id: String(row.id || ''),
                type: String(row.type || ''),
                status: String(row.status || ''),
                originLocationName: row.origin_location_name ? String(row.origin_location_name) : undefined,
                destinationLocationName: row.destination_location_name ? String(row.destination_location_name) : undefined,
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                expectedDelivery: row.expected_delivery ? new Date(row.expected_delivery).toISOString() : undefined,
                itemCount: Number(row.item_count || 0),
                createdByName: row.created_by_name ? String(row.created_by_name) : undefined,
            })),
        };
    } catch (error: any) {
        logger.error({ error }, '[Reports] Pending shipments drilldown error');
        return { success: false, error: 'Error obteniendo shipments pendientes' };
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
    let actor: Awaited<ReturnType<typeof getActorOrFail>>;

    try {
        actor = requireRole(await getActorOrFail(), ROLE_GROUPS.ADMIN);
    } catch (error) {
        if (error instanceof PinRbacError) {
            if (error.code === 'AUTH_FORBIDDEN') {
                return { success: false, error: 'Solo administradores pueden ver nómina' };
            }

            return { success: false, error: 'No autenticado' };
        }

        throw error;
    }

    if (!adminPin) {
        return { success: false, error: 'Se requiere PIN de administrador para acceder a datos de nómina' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const authResult = await validatePinForRoles(client, adminPin, ROLE_GROUPS.ADMIN, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });
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
        `, [actor.userId, JSON.stringify({
            month,
            year,
            employees_count: data.length,
            accessed_by: actor.userName || actor.userId,
            authorized_by_id: authResult.authorizedBy.id,
            authorized_by_name: authResult.authorizedBy.name,
        })]);

        await client.query('COMMIT');

        logger.info({
            actorUserId: actor.userId,
            authorizedById: authResult.authorizedBy.id,
            month,
            year,
        }, '👥 [Reports] Payroll accessed');
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
    endDate: string,
    locationId?: string,
): Promise<{ success: boolean; data?: FinancialSummary; error?: string }> {
    const actorResult = await requireReportActor(ACCOUNTING_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    try {
        const actor = actorResult.actor;
        const locationScopeResult = resolveEffectiveLocation(actor, locationId);
        if (!locationScopeResult.success) {
            return { success: false, error: locationScopeResult.error };
        }

        const effectiveLocationId = locationScopeResult.locationId;
        const endDateObj = endDate ? new Date(endDate) : new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const params: string[] = [startDateObj.toISOString(), endDateObj.toISOString()];
        const salesLocationFilter = effectiveLocationId ? ` AND location_id::text = $3::text` : '';

        // 1. Sales (excluyendo anuladas)
        const salesRes = await query(`
            SELECT SUM(total_amount) as total 
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
            AND status NOT IN ('VOIDED')
            ${salesLocationFilter}
        `, effectiveLocationId ? [...params, effectiveLocationId] : params);
        let totalSales = Number(salesRes.rows[0]?.total) || 0;

        // 1b. Restar devoluciones
        try {
            const refundsRes = await query(`
                SELECT COALESCE(SUM(total_amount), 0) as total FROM refunds
                WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
                AND status = 'COMPLETED'
                ${salesLocationFilter}
            `, effectiveLocationId ? [...params, effectiveLocationId] : params);
            totalSales -= Number(refundsRes.rows[0]?.total) || 0;
        } catch { /* tabla puede no existir */ }

        // 2. Expenses (Categorized by LIKE on reason)
        const expensesRes = await query(`
            SELECT reason, amount 
            FROM cash_movements 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp 
            AND (type = 'OUT' OR type IN ('WITHDRAWAL', 'EXPENSE', 'CLOSING'))
            ${effectiveLocationId ? 'AND location_id::text = $3::text' : ''}
        `, effectiveLocationId ? [...params, effectiveLocationId] : params);

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
        await auditReportAccess(actor.userId, 'FINANCIAL_SUMMARY', { startDate, endDate, locationId: effectiveLocationId });

        logger.info({ userId: actor.userId, locationId: effectiveLocationId }, '📊 [Reports] Financial summary accessed');
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
    const actorResult = await requireReportActor(MANAGER_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    try {
        const actor = actorResult.actor;
        const requestedLocationId = warehouseId
            ? await resolveLocationFromWarehouseOrLocation(warehouseId)
            : undefined;

        if (warehouseId && !requestedLocationId) {
            return { success: false, error: 'Bodega o ubicación inválida' };
        }

        const locationScopeResult = resolveEffectiveLocation(actor, requestedLocationId);
        if (!locationScopeResult.success) {
            return { success: false, error: locationScopeResult.error };
        }

        const effectiveLocationId = locationScopeResult.locationId;
        const endDateObj = endDate ? new Date(endDate) : new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const params: any[] = [startDateObj.toISOString(), endDateObj.toISOString()];
        let locFilter = '';

        if (effectiveLocationId) {
            locFilter = 'AND location_id::text = $3';
            params.push(effectiveLocationId);
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
        await auditReportAccess(actor.userId, 'LOGISTICS_KPIS', {
            startDate,
            endDate,
            warehouseId,
            locationId: effectiveLocationId,
        });

        logger.info({ userId: actor.userId, locationId: effectiveLocationId }, '📦 [Reports] Logistics KPIs accessed');
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
    const actorResult = await requireReportActor(MANAGER_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    try {
        const actor = actorResult.actor;
        const requestedLocationId = warehouseId
            ? await resolveLocationFromWarehouseOrLocation(warehouseId)
            : undefined;

        if (warehouseId && !requestedLocationId) {
            return { success: false, error: 'Bodega o ubicación inválida' };
        }

        const locationScopeResult = resolveEffectiveLocation(actor, requestedLocationId);
        if (!locationScopeResult.success) {
            return { success: false, error: locationScopeResult.error };
        }

        const effectiveLocationId = locationScopeResult.locationId;
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
        if (effectiveLocationId) {
            queryStr += ` AND sm.location_id::text = $3`;
            params.push(effectiveLocationId);
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
        await auditReportAccess(actor.userId, 'STOCK_MOVEMENTS', {
            type,
            startDate,
            endDate,
            warehouseId,
            locationId: effectiveLocationId,
        });

        logger.info({ userId: actor.userId, locationId: effectiveLocationId, count: data.length }, '🕵️ [Reports] Stock movements accessed');
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Reports] Stock movements error');
        return { success: false, error: 'Error obteniendo movimientos de stock' };
    }
}
