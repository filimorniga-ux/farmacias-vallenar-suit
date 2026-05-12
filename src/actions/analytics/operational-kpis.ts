'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
    ANALYTICS_GLOBAL_ROLES,
    ANALYTICS_PAGE_ROLES,
    requireScopedActor,
    resolveEffectiveLocation,
} from '@/actions/admin-scope';
import { getWarehouseLocationId } from '@/actions/scoped-location';
import { z } from 'zod';

const UUIDSchema = z.string().uuid();

const OperationalKpiFiltersSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: UUIDSchema.optional(),
    warehouseId: UUIDSchema.optional(),
    granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export type OperationalKpiFilters = z.infer<typeof OperationalKpiFiltersSchema>;

export interface OperationalTopProduct {
    productId: string;
    sku: string;
    name: string;
    unitsSold: number;
    totalAmount: number;
}

export interface OperationalCriticalItem {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    stockMin: number;
    warehouseId?: string;
    locationId?: string;
}

export interface OperationalKpiOverview {
    scope: {
        startDate: string;
        endDate: string;
        locationId?: string;
        warehouseId?: string;
        granularity: 'day' | 'week' | 'month';
    };
    sales: {
        netSales: number;
        ticketCount: number;
        averageTicket: number;
        topProducts: OperationalTopProduct[];
    };
    cash: {
        openSessions: number;
        closedSessions: number;
        longOpenSessions: number;
    };
    inventory: {
        criticalLowStockCount: number;
        criticalItems: OperationalCriticalItem[];
    };
    procurement: {
        openPurchaseOrders: number;
        byStatus: Array<{ status: string; count: number }>;
    };
    wms: {
        pendingTransfers: number;
        pendingInboundShipments: number;
    };
}

export type OperationalKpiOverviewResult =
    | { success: true; data: OperationalKpiOverview }
    | { success: false; error: string };

function santiagoDateInput(date: Date) {
    const parts = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? String(date.getFullYear());
    const month = parts.find((part) => part.type === 'month')?.value ?? String(date.getMonth() + 1).padStart(2, '0');
    const day = parts.find((part) => part.type === 'day')?.value ?? String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function normalizeDateRange(startDate?: string, endDate?: string) {
    const today = santiagoDateInput(new Date());
    const startInput = startDate || today;
    const endInput = endDate || startInput;

    const start = new Date(`${startInput}T00:00:00.000`);
    const end = new Date(`${endInput}T23:59:59.999`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return null;
    }

    return {
        startDate: startInput,
        endDate: endInput,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    };
}

function toInt(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function buildLocationFilter(params: string[], column: string, locationId?: string) {
    if (!locationId) return '';
    params.push(locationId);
    return ` AND ${column}::text = $${params.length}::text`;
}

function buildWarehouseFilter(params: string[], column: string, warehouseId?: string) {
    if (!warehouseId) return '';
    params.push(warehouseId);
    return ` AND ${column}::text = $${params.length}::text`;
}

export async function getOperationalKpiOverviewSecure(
    rawFilters: OperationalKpiFilters,
): Promise<OperationalKpiOverviewResult> {
    const auth = await requireScopedActor(ANALYTICS_PAGE_ROLES);
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const parsed = OperationalKpiFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Filtros inválidos' };
    }

    const dateRange = normalizeDateRange(parsed.data.startDate, parsed.data.endDate);
    if (!dateRange) {
        return { success: false, error: 'Rango de fechas inválido' };
    }

    try {
        const locationScope = resolveEffectiveLocation(auth.actor, parsed.data.locationId, ANALYTICS_GLOBAL_ROLES);
        if (!locationScope.success) {
            return { success: false, error: locationScope.error };
        }

        let effectiveLocationId = locationScope.locationId;
        const effectiveWarehouseId = parsed.data.warehouseId;

        if (effectiveWarehouseId) {
            const warehouseLocationId = await getWarehouseLocationId(effectiveWarehouseId);
            if (!warehouseLocationId) {
                return { success: false, error: 'Bodega inválida' };
            }
            if (effectiveLocationId && warehouseLocationId !== effectiveLocationId) {
                return { success: false, error: 'La bodega no pertenece a la ubicación efectiva' };
            }
            effectiveLocationId = effectiveLocationId || warehouseLocationId;
        }

        const salesParams = [dateRange.startIso, dateRange.endIso];
        const salesLocationFilter = buildLocationFilter(salesParams, 's.location_id', effectiveLocationId);

        const cashParams = [dateRange.startIso, dateRange.endIso];
        const cashLocationFilter = buildLocationFilter(cashParams, 't.location_id', effectiveLocationId);

        const inventoryParams: string[] = [];
        const inventoryLocationFilter = buildLocationFilter(inventoryParams, 'ib.location_id', effectiveLocationId);
        const inventoryWarehouseFilter = buildWarehouseFilter(inventoryParams, 'ib.warehouse_id', effectiveWarehouseId);

        const poParams: string[] = [];
        const poLocationFilter = buildLocationFilter(poParams, 'w.location_id', effectiveLocationId);
        const poWarehouseFilter = buildWarehouseFilter(poParams, 'po.target_warehouse_id', effectiveWarehouseId);

        const shipmentParams: string[] = [];
        let shipmentLocationFilter = '';
        if (effectiveLocationId) {
            shipmentParams.push(effectiveLocationId);
            shipmentLocationFilter = ` AND (s.origin_location_id::text = $${shipmentParams.length}::text OR s.destination_location_id::text = $${shipmentParams.length}::text)`;
        }
        let shipmentWarehouseFilter = '';
        if (effectiveWarehouseId) {
            shipmentParams.push(effectiveWarehouseId);
            shipmentWarehouseFilter = ` AND (s.origin_warehouse_id::text = $${shipmentParams.length}::text OR s.target_warehouse_id::text = $${shipmentParams.length}::text)`;
        }

        const [
            salesRes,
            topProductsRes,
            cashRes,
            criticalCountRes,
            criticalItemsRes,
            openOrdersRes,
            openOrdersByStatusRes,
            shipmentsRes,
        ] = await Promise.all([
            query(`
                SELECT
                    COALESCE(SUM(s.total_amount), 0) AS net_sales,
                    COUNT(s.id) AS ticket_count
                FROM sales s
                WHERE s.status = 'COMPLETED'
                  AND s.timestamp >= $1::timestamp
                  AND s.timestamp <= $2::timestamp
                  ${salesLocationFilter}
            `, salesParams),
            query(`
                SELECT
                    p.id::text AS product_id,
                    MAX(COALESCE(p.sku, ib.sku, '')) AS sku,
                    MAX(COALESCE(p.name, ib.name, 'Producto sin nombre')) AS name,
                    SUM(si.quantity - COALESCE(si.refunded_quantity, 0)) AS units_sold,
                    ROUND(SUM((si.quantity - COALESCE(si.refunded_quantity, 0)) * si.unit_price), 0) AS total_amount
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN inventory_batches ib ON si.batch_id = ib.id
                JOIN products p ON ib.product_id::text = p.id::text
                WHERE s.status = 'COMPLETED'
                  AND s.timestamp >= $1::timestamp
                  AND s.timestamp <= $2::timestamp
                  ${salesLocationFilter}
                GROUP BY p.id
                HAVING SUM(si.quantity - COALESCE(si.refunded_quantity, 0)) > 0
                ORDER BY units_sold DESC, total_amount DESC
                LIMIT 5
            `, salesParams),
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE crs.closed_at IS NULL) AS open_sessions,
                    COUNT(*) FILTER (
                        WHERE crs.closed_at IS NOT NULL
                          AND crs.closed_at >= $1::timestamp
                          AND crs.closed_at <= $2::timestamp
                    ) AS closed_sessions,
                    COUNT(*) FILTER (
                        WHERE crs.closed_at IS NULL
                          AND crs.opened_at < NOW() - INTERVAL '12 hours'
                    ) AS long_open_sessions
                FROM cash_register_sessions crs
                JOIN terminals t ON crs.terminal_id = t.id
                WHERE 1=1
                  ${cashLocationFilter}
            `, cashParams),
            query(`
                SELECT COUNT(*) AS count
                FROM inventory_batches ib
                WHERE COALESCE(ib.quantity_real, 0) < COALESCE(ib.stock_min, 0)
                  ${inventoryLocationFilter}
                  ${inventoryWarehouseFilter}
            `, inventoryParams),
            query(`
                SELECT
                    COALESCE(ib.product_id::text, ib.id::text) AS product_id,
                    COALESCE(p.sku, ib.sku, '') AS sku,
                    COALESCE(p.name, ib.name, 'Producto sin nombre') AS name,
                    COALESCE(ib.quantity_real, 0) AS quantity,
                    COALESCE(ib.stock_min, 0) AS stock_min,
                    ib.warehouse_id::text AS warehouse_id,
                    ib.location_id::text AS location_id
                FROM inventory_batches ib
                LEFT JOIN products p ON ib.product_id::text = p.id::text
                WHERE COALESCE(ib.quantity_real, 0) < COALESCE(ib.stock_min, 0)
                  ${inventoryLocationFilter}
                  ${inventoryWarehouseFilter}
                ORDER BY (COALESCE(ib.stock_min, 0) - COALESCE(ib.quantity_real, 0)) DESC
                LIMIT 8
            `, inventoryParams),
            query(`
                SELECT COUNT(*) AS count
                FROM purchase_orders po
                LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
                WHERE po.status NOT IN ('RECEIVED', 'CANCELLED')
                  ${poLocationFilter}
                  ${poWarehouseFilter}
            `, poParams),
            query(`
                SELECT po.status, COUNT(*) AS count
                FROM purchase_orders po
                LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
                WHERE po.status NOT IN ('RECEIVED', 'CANCELLED')
                  ${poLocationFilter}
                  ${poWarehouseFilter}
                GROUP BY po.status
                ORDER BY po.status ASC
            `, poParams),
            query(`
                SELECT
                    COUNT(*) FILTER (
                        WHERE s.type = 'INTER_BRANCH'
                          AND s.status IN ('PENDING', 'IN_TRANSIT')
                    ) AS pending_transfers,
                    COUNT(*) FILTER (
                        WHERE s.type IN ('INBOUND', 'INBOUND_PROVIDER')
                          AND s.status IN ('PENDING', 'IN_TRANSIT')
                    ) AS pending_inbound_shipments
                FROM shipments s
                WHERE 1=1
                  ${shipmentLocationFilter}
                  ${shipmentWarehouseFilter}
            `, shipmentParams),
        ]);

        const salesRow = salesRes.rows[0] || {};
        const netSales = toInt(salesRow.net_sales);
        const ticketCount = toInt(salesRow.ticket_count);
        const averageTicket = ticketCount > 0 ? Math.round(netSales / ticketCount) : 0;
        const cashRow = cashRes.rows[0] || {};
        const shipmentsRow = shipmentsRes.rows[0] || {};

        return {
            success: true,
            data: {
                scope: {
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                    locationId: effectiveLocationId,
                    warehouseId: effectiveWarehouseId,
                    granularity: parsed.data.granularity,
                },
                sales: {
                    netSales,
                    ticketCount,
                    averageTicket,
                    topProducts: topProductsRes.rows.map((row) => ({
                        productId: String(row.product_id || ''),
                        sku: String(row.sku || ''),
                        name: String(row.name || ''),
                        unitsSold: toInt(row.units_sold),
                        totalAmount: toInt(row.total_amount),
                    })),
                },
                cash: {
                    openSessions: toInt(cashRow.open_sessions),
                    closedSessions: toInt(cashRow.closed_sessions),
                    longOpenSessions: toInt(cashRow.long_open_sessions),
                },
                inventory: {
                    criticalLowStockCount: toInt(criticalCountRes.rows[0]?.count),
                    criticalItems: criticalItemsRes.rows.map((row) => ({
                        productId: String(row.product_id || ''),
                        sku: String(row.sku || ''),
                        name: String(row.name || ''),
                        quantity: toInt(row.quantity),
                        stockMin: toInt(row.stock_min),
                        warehouseId: row.warehouse_id ? String(row.warehouse_id) : undefined,
                        locationId: row.location_id ? String(row.location_id) : undefined,
                    })),
                },
                procurement: {
                    openPurchaseOrders: toInt(openOrdersRes.rows[0]?.count),
                    byStatus: openOrdersByStatusRes.rows.map((row) => ({
                        status: String(row.status || 'UNKNOWN'),
                        count: toInt(row.count),
                    })),
                },
                wms: {
                    pendingTransfers: toInt(shipmentsRow.pending_transfers),
                    pendingInboundShipments: toInt(shipmentsRow.pending_inbound_shipments),
                },
            },
        };
    } catch (error) {
        logger.error({ error }, '[OperationalKPIs] overview failed');
        return { success: false, error: 'Error obteniendo KPIs operativos' };
    }
}
