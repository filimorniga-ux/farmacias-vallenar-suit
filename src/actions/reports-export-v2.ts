'use server';

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { ExcelService } from '@/lib/excel-generator';
import { startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';

// Reuse the schema from reports-v2 but we only need it for validation here
const ReportFilterSchema = z.object({
    period: z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']).optional().default('TODAY'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: z.string().optional(),
    terminalId: z.string().optional(),
    employeeId: z.string().optional(),
    searchQuery: z.string().optional(),
});

type ReportParams = z.infer<typeof ReportFilterSchema>;

// --- HELPER: DATE RANGE (Duplicated to avoid circular deps or verify consistency) ---
function getDateRange(period: string, startStr?: string, endStr?: string) {
    const now = new Date();
    let start = startOfDay(now);
    let end = endOfDay(now);

    try {
        switch (period) {
            case 'TODAY':
                start = startOfDay(now);
                end = endOfDay(now);
                break;
            case 'THIS_WEEK':
                start = startOfWeek(now, { weekStartsOn: 1 });
                end = endOfDay(now);
                break;
            case 'THIS_MONTH':
                start = startOfMonth(now);
                end = endOfDay(now);
                break;
            case 'CUSTOM':
                if (startStr) start = new Date(startStr);
                if (endStr) end = new Date(endStr);
                end = endOfDay(end);
                break;
        }
    } catch (e) {
        console.error('Date parsing error', e);
    }

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

async function getSession() {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const userName = headersList.get('x-user-name');
        if (!userId) return null;
        return { userId, role, userName };
    } catch {
        return null;
    }
}

export async function exportProductSalesSecure(params: ReportParams): Promise<{
    success: boolean;
    data?: string; // base64
    filename?: string;
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const filters = ReportFilterSchema.parse(params);
        const { start, end } = getDateRange(filters.period, filters.startDate, filters.endDate);

        const queryParams: any[] = [start, end];
        let paramIndex = 3;

        // Build Query - MUST MATCH reports-v2.ts logic exactly
        let sql = `
            SELECT 
                p.id as product_id,
                MAX(p.sku) as sku,
                MAX(p.name) as product_name,
                MAX(p.category) as category,
                SUM(si.quantity) as units_sold,
                SUM(si.total_price) as total_amount,
                ROUND(AVG(si.unit_price), 0) as avg_price,
                COUNT(DISTINCT s.id) as transaction_count
            FROM sale_items si
            JOIN inventory_batches ib ON si.batch_id = ib.id
            JOIN products p ON ib.product_id::text = p.id
            JOIN sales s ON si.sale_id = s.id
            WHERE 
                s.timestamp >= $1 AND s.timestamp <= $2
        `;

        // Filter: Location
        if (filters.locationId && filters.locationId !== 'ALL') {
            sql += ` AND s.location_id = $${paramIndex}::uuid`;
            queryParams.push(filters.locationId);
            paramIndex++;
        }

        // Filter: Terminal
        if (filters.terminalId && filters.terminalId !== 'ALL') {
            sql += ` AND s.terminal_id = $${paramIndex}::uuid`;
            queryParams.push(filters.terminalId);
            paramIndex++;
        }

        // Filter: Employee
        if (filters.employeeId && filters.employeeId !== 'ALL') {
            sql += ` AND s.user_id = $${paramIndex}`;
            queryParams.push(filters.employeeId);
            paramIndex++;
        }

        // Filter: Search (SKU or Name)
        if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
            const term = `%${filters.searchQuery.trim()}%`;
            sql += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
            queryParams.push(term);
            paramIndex++;
        }

        // Grouping & Ordering
        // For Excel, we might want ALL rows, not just top 100
        sql += `
            GROUP BY p.id
            ORDER BY units_sold DESC
            LIMIT 10000
        `;

        const result = await query(sql, queryParams);

        // Map to Excel format
        const excelData = result.rows.map(row => ({
            product: row.product_name,
            sku: row.sku,
            category: row.category || 'General',
            units: Number(row.units_sold),
            price_avg: Number(row.avg_price),
            total: Number(row.total_amount),
            transactions: Number(row.transaction_count)
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte Ventas por Producto',
            subtitle: `Generado: ${new Date().toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName || undefined,
            columns: [
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Categoría', key: 'category', width: 15 },
                { header: 'Unidades', key: 'units', width: 10 },
                { header: 'Precio Prom.', key: 'price_avg', width: 15 },
                { header: 'Venta Total', key: 'total', width: 15 },
                { header: 'Transacciones', key: 'transactions', width: 12 },
            ],
            data: excelData
        });

        const safeDate = new Date().toISOString().split('T')[0];
        const filename = `VentasPorProducto_${safeDate}.xlsx`;

        return {
            success: true,
            data: buffer.toString('base64'),
            filename
        };

    } catch (error: any) {
        console.error('[Export] Product Sales Error:', error);
        return { success: false, error: 'Error generando Excel' };
    }
}
