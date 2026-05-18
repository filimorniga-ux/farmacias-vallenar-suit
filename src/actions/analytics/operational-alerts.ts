'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
    getOperationalKpiOverviewSecure,
    type OperationalKpiFilters,
} from './operational-kpis';
import {
    OPERATIONAL_ALERT_EXCLUSIONS,
    type OperationalAlert,
    type OperationalAlertsPayload,
    type OperationalAlertsResult,
} from './operational-alerts-model';
import { z } from 'zod';

const UUIDSchema = z.string().uuid();

const OperationalAlertFiltersSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: UUIDSchema.optional(),
    warehouseId: UUIDSchema.optional(),
    granularity: z.enum(['day', 'week', 'month']).default('day'),
});

const STALE_PURCHASE_ORDER_DAYS = 7;

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

function toInt(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function baseDrilldownFilters(scope: OperationalAlertsPayload['scope']) {
    return {
        startDate: scope.startDate,
        endDate: scope.endDate,
        locationId: scope.locationId,
        warehouseId: scope.warehouseId,
    };
}

async function getStalePurchaseOrderSignal(scope: OperationalAlertsPayload['scope']) {
    const params: string[] = [];
    const filters = [
        "po.status NOT IN ('RECEIVED', 'CANCELLED')",
        `po.created_at < (NOW() AT TIME ZONE 'America/Santiago') - INTERVAL '${STALE_PURCHASE_ORDER_DAYS} days'`,
    ];

    if (scope.locationId) {
        params.push(scope.locationId);
        filters.push(`w.location_id::text = $${params.length}::text`);
    }

    if (scope.warehouseId) {
        params.push(scope.warehouseId);
        filters.push(`po.target_warehouse_id::text = $${params.length}::text`);
    }

    const result = await query(`
        SELECT COUNT(*) AS count, MIN(po.created_at) AS oldest_created_at
        FROM purchase_orders po
        LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
        WHERE ${filters.join(' AND ')}
    `, params);

    const row = result.rows[0] || {};
    const oldestDate = row.oldest_created_at ? santiagoDateInput(new Date(row.oldest_created_at)) : undefined;

    return {
        count: toInt(row.count),
        oldestDate,
    };
}

export async function getOperationalAlertsSecure(
    rawFilters: OperationalKpiFilters,
): Promise<OperationalAlertsResult> {
    const parsed = OperationalAlertFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Filtros inválidos' };
    }

    const overviewResult = await getOperationalKpiOverviewSecure(parsed.data);
    if (!overviewResult.success) {
        return { success: false, error: overviewResult.error };
    }

    const { scope, cash, inventory, procurement, wms, sales } = overviewResult.data;
    const alerts: OperationalAlert[] = [];
    const commonFilters = baseDrilldownFilters(scope);

    try {
        if (cash.longOpenSessions > 0) {
            alerts.push({
                id: 'cash-long-open-sessions',
                name: 'Cajas abiertas demasiado tiempo',
                definition: 'Cajas con sesión abierta por más de 12 horas.',
                trigger: 'cash.longOpenSessions > 0',
                severity: 'critical',
                source: 'cash-management-v2 / cash_register_sessions',
                owner: 'caja',
                value: cash.longOpenSessions,
                threshold: '> 12 horas',
                drilldown: { target: 'cash', filters: commonFilters },
            });
        }

        if (inventory.criticalLowStockCount > 0) {
            alerts.push({
                id: 'inventory-critical-low-stock',
                name: 'Productos bajo mínimo crítico',
                definition: 'Productos cuyo stock real está bajo su mínimo configurado.',
                trigger: 'inventory.criticalLowStockCount > 0',
                severity: 'critical',
                source: 'inventory-v2 / inventory_batches',
                owner: 'inventario',
                value: inventory.criticalLowStockCount,
                threshold: 'stock_real < stock_min',
                drilldown: { target: 'inventory-low-stock', filters: commonFilters },
            });
        }

        if (sales.ticketCount === 0) {
            alerts.push({
                id: 'sales-no-activity',
                name: 'Sin tickets en el período',
                definition: 'No existen ventas completadas para el filtro operativo seleccionado.',
                trigger: 'sales.ticketCount === 0',
                severity: 'info',
                source: 'sales-v2 / sales',
                owner: 'ventas',
                value: 0,
                threshold: '0 tickets',
                drilldown: { target: 'sales-products', filters: commonFilters },
            });
        }

        const staleOrders = await getStalePurchaseOrderSignal(scope);
        if (staleOrders.count > 0) {
            alerts.push({
                id: 'procurement-stale-open-orders',
                name: 'Órdenes abiertas estancadas',
                definition: `Órdenes de compra abiertas por más de ${STALE_PURCHASE_ORDER_DAYS} días.`,
                trigger: `openPurchaseOrders.created_at < hoy - ${STALE_PURCHASE_ORDER_DAYS} días`,
                severity: 'warning',
                source: 'procurement / purchase_orders',
                owner: 'procurement',
                value: staleOrders.count,
                threshold: `> ${STALE_PURCHASE_ORDER_DAYS} días abiertas`,
                drilldown: {
                    target: 'procurement-orders',
                    filters: {
                        ...commonFilters,
                        startDate: staleOrders.oldestDate || commonFilters.startDate,
                        endDate: santiagoDateInput(new Date()),
                    },
                },
            });
        } else if (procurement.openPurchaseOrders > 0) {
            alerts.push({
                id: 'procurement-open-orders',
                name: 'Órdenes abiertas por revisar',
                definition: 'Órdenes de compra abiertas que todavía no están recibidas ni canceladas.',
                trigger: 'procurement.openPurchaseOrders > 0',
                severity: 'info',
                source: 'procurement / purchase_orders',
                owner: 'procurement',
                value: procurement.openPurchaseOrders,
                threshold: '> 0 órdenes abiertas',
                drilldown: { target: 'procurement-orders', filters: commonFilters },
            });
        }

        if (wms.pendingTransfers > 0) {
            alerts.push({
                id: 'wms-pending-transfers',
                name: 'Transferencias pendientes',
                definition: 'Shipments inter-sucursal en estado pendiente o en tránsito.',
                trigger: 'wms.pendingTransfers > 0',
                severity: 'warning',
                source: 'wms / shipments',
                owner: 'wms',
                value: wms.pendingTransfers,
                threshold: '> 0 transferencias pendientes',
                drilldown: { target: 'wms-transfers', filters: commonFilters },
            });
        }

        if (wms.pendingInboundShipments > 0) {
            alerts.push({
                id: 'wms-pending-receptions',
                name: 'Recepciones pendientes',
                definition: 'Shipments inbound pendientes o en tránsito.',
                trigger: 'wms.pendingInboundShipments > 0',
                severity: 'warning',
                source: 'wms / shipments',
                owner: 'wms',
                value: wms.pendingInboundShipments,
                threshold: '> 0 recepciones pendientes',
                drilldown: { target: 'wms-receptions', filters: commonFilters },
            });
        }

        return {
            success: true,
            data: {
                scope,
                generatedAt: new Date().toISOString(),
                alerts,
                exclusions: [...OPERATIONAL_ALERT_EXCLUSIONS],
            },
        };
    } catch (error) {
        logger.error({ error }, '[OperationalAlerts] alerts failed');
        return { success: false, error: 'Error obteniendo alertas operativas' };
    }
}
