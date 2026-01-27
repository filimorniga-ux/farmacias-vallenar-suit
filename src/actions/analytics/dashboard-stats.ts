'use server';

import { query } from '@/lib/db';

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

    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 1. Sales Stats (Today) & Last Sale Time
        const salesQuery = `
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_sales,
                COUNT(*) as tx_count,
                MAX(created_at) as last_sale,
                COALESCE(SUM(CASE WHEN branch_source = 'SANTIAGO' THEN total_amount ELSE 0 END), 0) as santiago_sales,
                COALESCE(SUM(CASE WHEN branch_source = 'COLCHAGUA' THEN total_amount ELSE 0 END), 0) as colchagua_sales
            FROM sales_headers
            WHERE created_at >= CURRENT_DATE
        `;

        // 2. Low Stock Count (Threshold <= 5)
        const lowStockQuery = `
            SELECT COUNT(*) as count 
            FROM inventory_imports 
            WHERE (raw_stock <= 5 OR raw_stock IS NULL)
            AND raw_stock > 0 
        `;

        // 3. Total Inventory Value
        const inventoryValueQuery = `
            SELECT COALESCE(SUM(raw_stock * raw_price), 0) as total_value
            FROM inventory_imports
            WHERE raw_stock > 0 AND raw_price > 0
        `;

        const [salesRes, lowStockRes, invValueRes] = await Promise.all([
            query(salesQuery),
            query(lowStockQuery),
            query(inventoryValueQuery)
        ]);

        const salesRow = salesRes.rows[0];

        return {
            todaySales: Number(salesRow.total_sales),
            transactionCount: Number(salesRow.tx_count),
            santiagoSales: Number(salesRow.santiago_sales),
            colchaguaSales: Number(salesRow.colchagua_sales),
            lowStockCount: Number(lowStockRes.rows[0].count),
            pendingOrders: Number(lowStockRes.rows[0].count),
            totalInventoryValue: Number(invValueRes.rows[0].total_value),
            lastSaleTime: salesRow.last_sale ? new Date(salesRow.last_sale).toISOString() : null
        };

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
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
