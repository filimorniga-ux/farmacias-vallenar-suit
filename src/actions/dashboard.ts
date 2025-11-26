'use server';

import { query } from '@/lib/db';

export interface DashboardMetrics {
    salesToday: number;
    ticketCount: number;
    criticalStock: number;
    expiringBatches: number;
    coldChainStatus: 'Estable' | 'Alerta';
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
        // 1. Sales Today & Ticket Count
        const salesSql = `
            SELECT 
                COALESCE(SUM(total), 0) as total_sales, 
                COUNT(*) as ticket_count 
            FROM ventas 
            WHERE DATE(fecha) = CURRENT_DATE
        `;
        const salesResult = await query(salesSql);
        const salesToday = salesResult.rows.length > 0 ? parseInt(salesResult.rows[0].total_sales || '0') : 0;
        const ticketCount = salesResult.rows.length > 0 ? parseInt(salesResult.rows[0].ticket_count || '0') : 0;

        // 2. Critical Stock (Products with < 10 units)
        // We sum up lots for each product
        const stockSql = `
            SELECT COUNT(*) as critical_count 
            FROM (
                SELECT p.id, COALESCE(SUM(l.cantidad_disponible), 0) as total_stock 
                FROM productos p 
                LEFT JOIN lotes l ON p.id = l.producto_id 
                GROUP BY p.id
            ) as stocks 
            WHERE total_stock < 10
        `;
        const stockResult = await query(stockSql);
        const criticalStock = stockResult.rows.length > 0 ? parseInt(stockResult.rows[0].critical_count || '0') : 0;

        // 3. Expiring Batches (Next 30 days)
        const expiringSql = `
            SELECT COUNT(*) as expiring_count
            FROM lotes
            WHERE fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
            AND cantidad_disponible > 0
        `;
        const expiringResult = await query(expiringSql);
        const expiringBatches = expiringResult.rows.length > 0 ? parseInt(expiringResult.rows[0].expiring_count || '0') : 0;

        return {
            salesToday,
            ticketCount,
            criticalStock,
            expiringBatches,
            coldChainStatus: 'Estable' // Mocked for now
        };
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        return {
            salesToday: 0,
            ticketCount: 0,
            criticalStock: 0,
            expiringBatches: 0,
            coldChainStatus: 'Estable'
        };
    }
}
