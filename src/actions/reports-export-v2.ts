'use server';

import { query } from '@/lib/db';
import { z } from 'zod';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL } from '@/lib/timezone';
import { startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { getSessionSecure } from './auth-v2';

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

// --- HELPER: DATE RANGE ---
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
    } catch { }

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

export async function exportProductSalesSecure(params: ReportParams): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    try {
        const filters = ReportFilterSchema.parse(params);
        const { start, end } = getDateRange(filters.period, filters.startDate, filters.endDate);

        const queryParams: any[] = [start, end];
        let paramIndex = 3;

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
            JOIN products p ON ib.product_id = p.id
            JOIN sales s ON si.sale_id = s.id
            WHERE s.timestamp >= $1 AND s.timestamp <= $2
        `;

        if (filters.locationId && filters.locationId !== 'ALL') {
            sql += ` AND s.location_id = $${paramIndex}::uuid`;
            queryParams.push(filters.locationId);
            paramIndex++;
        }

        if (filters.terminalId && filters.terminalId !== 'ALL') {
            sql += ` AND s.terminal_id = $${paramIndex}::uuid`;
            queryParams.push(filters.terminalId);
            paramIndex++;
        }

        if (filters.employeeId && filters.employeeId !== 'ALL') {
            sql += ` AND s.user_id = $${paramIndex}`;
            queryParams.push(filters.employeeId);
            paramIndex++;
        }

        if (filters.searchQuery?.trim()) {
            sql += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
            queryParams.push(`%${filters.searchQuery.trim()}%`);
            paramIndex++;
        }

        sql += ` GROUP BY p.id ORDER BY units_sold DESC LIMIT 10000`;

        const result = await query(sql, queryParams);

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
            title: 'Reporte de Ventas por Producto - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(new Date(start))} al ${formatDateCL(new Date(end))}`,
            sheetName: 'Ranking de Productos',
            creator: session.userName || 'Sistema',
            columns: [
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Categoría', key: 'category', width: 15 },
                { header: 'Canjes/Ventas (U)', key: 'units', width: 18 },
                { header: 'Precio Promedio ($)', key: 'price_avg', width: 20 },
                { header: 'Ingresos Totales ($)', key: 'total', width: 20 },
                { header: 'Transacciones', key: 'transactions', width: 15 },
            ],
            data: excelData
        });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `RankingVentas_${startDateCL(new Date()).replace(/\//g, '-')}.xlsx`
        };

    } catch (error: any) {
        return { success: false, error: 'Error generando reporte: ' + error.message };
    }
}

function startDateCL(date: Date): string {
    return formatDateCL(date).replace(/\//g, '-');
}
