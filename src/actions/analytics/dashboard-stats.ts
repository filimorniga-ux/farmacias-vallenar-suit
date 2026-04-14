'use server';

import { query } from '@/lib/db';
import { requireScopedActor, hasGlobalScope, ANALYTICS_GLOBAL_ROLES } from '@/actions/admin-scope';
import { logger } from '@/lib/logger';

export interface DashboardStats {
    todaySales: number;
    transactionCount: number;
    lowStockCount: number;
    pendingOrders: number;
    totalInventoryValue: number;
    santiagoSales: number;
    colchaguaSales: number;
    lastSaleTime: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const actorResult = await requireScopedActor([
        'CASHIER',
        'CAJERO',
        'MANAGER',
        'ADMIN',
        'GERENTE_GENERAL',
        'QF',
        'TESORERO',
    ]);

    if (!actorResult.success) {
        return {
            todaySales: 0,
            transactionCount: 0,
            lowStockCount: 0,
            pendingOrders: 0,
            totalInventoryValue: 0,
            santiagoSales: 0,
            colchaguaSales: 0,
            lastSaleTime: null,
        };
    }

    try {
        const actor = actorResult.actor;
        const scopedLocationId = hasGlobalScope(actor.role, ANALYTICS_GLOBAL_ROLES)
            ? undefined
            : actor.locationId;
        const params: string[] = [];
        const salesFilters: string[] = ["s.status = 'COMPLETED'", 's.timestamp >= CURRENT_DATE'];
        const inventoryFilters: string[] = ['ib.quantity_real > 0'];
        const pendingOrderFilters: string[] = [
            "po.status IN ('PENDING', 'APPROVED', 'PARTIAL', 'IN_TRANSIT', 'RECEIVED_PARTIAL')",
        ];

        if (scopedLocationId) {
            params.push(scopedLocationId);
            salesFilters.push(`s.location_id::text = $${params.length}::text`);
            inventoryFilters.push(`ib.location_id::text = $${params.length}::text`);
            pendingOrderFilters.push(
                `po.target_warehouse_id IN (SELECT id FROM warehouses WHERE location_id::text = $${params.length}::text)`
            );
        }

        // 1. Sales Stats (Today) & Last Sale Time
        const salesQuery = `
            SELECT 
                COALESCE(SUM(s.total_amount), 0) as total_sales,
                COUNT(*) as tx_count,
                MAX(s.timestamp) as last_sale,
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(l.name, '')) LIKE '%SANTIAGO%' THEN s.total_amount ELSE 0 END), 0) as santiago_sales,
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(l.name, '')) LIKE '%COLCHAGUA%' THEN s.total_amount ELSE 0 END), 0) as colchagua_sales
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            WHERE ${salesFilters.join(' AND ')}
        `;

        // 2. Low Stock Count (Threshold <= 5)
        const lowStockQuery = `
            SELECT COUNT(*) as count
            FROM (
                SELECT ib.product_id
                FROM inventory_batches ib
                WHERE ${inventoryFilters.join(' AND ')}
                GROUP BY ib.product_id
                HAVING SUM(ib.quantity_real) <= 5
            ) low_stock
        `;

        // 3. Total Inventory Value
        const inventoryValueQuery = `
            SELECT COALESCE(SUM(ib.quantity_real * COALESCE(ib.unit_cost, 0)), 0) as total_value
            FROM inventory_batches ib
            WHERE ${inventoryFilters.join(' AND ')}
        `;

        const pendingOrdersQuery = `
            SELECT COUNT(*) as count
            FROM purchase_orders po
            WHERE ${pendingOrderFilters.join(' AND ')}
        `;

        const [salesRes, lowStockRes, invValueRes, pendingOrdersRes] = await Promise.all([
            query(salesQuery, params),
            query(lowStockQuery, params),
            query(inventoryValueQuery, params),
            query(pendingOrdersQuery, params),
        ]);

        const salesRow = salesRes.rows[0];

        return {
            todaySales: Number(salesRow.total_sales),
            transactionCount: Number(salesRow.tx_count),
            santiagoSales: Number(salesRow.santiago_sales),
            colchaguaSales: Number(salesRow.colchagua_sales),
            lowStockCount: Number(lowStockRes.rows[0].count),
            pendingOrders: Number(pendingOrdersRes.rows[0].count),
            totalInventoryValue: Number(invValueRes.rows[0].total_value),
            lastSaleTime: salesRow.last_sale ? new Date(salesRow.last_sale).toISOString() : null
        };

    } catch (error) {
        logger.error({ error }, '[DashboardStats] Error fetching dashboard stats');
        return {
            todaySales: 0,
            transactionCount: 0,
            lowStockCount: 0,
            pendingOrders: 0,
            totalInventoryValue: 0,
            santiagoSales: 0,
            colchaguaSales: 0,
            lastSaleTime: null
        };
    }
}
