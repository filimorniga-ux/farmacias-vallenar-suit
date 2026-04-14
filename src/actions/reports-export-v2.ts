'use server';

import { z } from 'zod';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateCL } from '@/lib/timezone';
import { startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import {
    PRODUCT_REPORT_ROLES,
    requireReportActor,
} from './report-scope';
import { getProductSalesReportSecure } from './reports-v2';

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
    const actorResult = await requireReportActor(PRODUCT_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const actor = actorResult.actor;

    try {
        const filters = ReportFilterSchema.parse(params);
        const { start, end } = getDateRange(filters.period, filters.startDate, filters.endDate);
        const reportResult = await getProductSalesReportSecure(filters);
        if (!reportResult.success || !reportResult.data) {
            return { success: false, error: reportResult.error || 'Error obteniendo datos del reporte' };
        }

        const excelData = reportResult.data.rows.map(row => ({
            product: row.product_name,
            sku: row.sku,
            category: row.category || 'General',
            units: Number(row.units_sold),
            refunded: Number(row.refunded_units || 0),
            price_avg: Number(row.avg_price),
            total: Number(row.total_amount),
            transactions: Number(row.transaction_count)
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Ventas por Producto - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(new Date(start))} al ${formatDateCL(new Date(end))}`,
            sheetName: 'Ranking de Productos',
            creator: actor.userName || 'Sistema',
            columns: [
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Categoría', key: 'category', width: 15 },
                { header: 'Ventas Netas (U)', key: 'units', width: 18 },
                { header: 'Devueltas (U)', key: 'refunded', width: 14 },
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
