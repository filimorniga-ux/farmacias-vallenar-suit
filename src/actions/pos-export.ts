'use server';

import { ExcelService } from '@/lib/excel-generator';
import { query } from '@/lib/db';

interface ExportSalesParams {
    startDate: string;
    endDate: string;
    locationId?: string;
    requestingUserRole?: string;
}

export async function exportSalesHistory(params: ExportSalesParams) {
    try {
        const { startDate, endDate, locationId, requestingUserRole } = params;
        const excel = new ExcelService();

        // Security / Scope
        const isManagerial = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'].includes(requestingUserRole || '');

        let sql = `
            SELECT 
                s.id, 
                s.timestamp, 
                s.total_amount, 
                s.payment_method, 
                s.dte_folio, 
                s.dte_status,
                l.name as branch_name, 
                u.name as seller_name,
                s.customer_rut,
                (SELECT name FROM customers c WHERE c.id = s.customer_id) as customer_name
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1 AND s.timestamp <= $2
        `;

        const startTs = new Date(startDate).getTime();
        const endTs = new Date(endDate).getTime() + 86399999; // End of day
        const queryParams: any[] = [startTs, endTs];

        if (!isManagerial && locationId) {
            sql += ` AND s.location_id = $${queryParams.length + 1}`;
            queryParams.push(locationId);
        } else if (locationId && locationId !== 'ALL') {
            sql += ` AND s.location_id = $${queryParams.length + 1}`;
            queryParams.push(locationId);
        }

        sql += ` ORDER BY s.timestamp DESC`;

        const result = await query(sql, queryParams);

        // Format data for ExcelService
        const data = result.rows.map(row => ({
            id: row.id,
            date: new Date(Number(row.timestamp)).toLocaleString('es-CL'),
            branch: row.branch_name || 'N/A',
            seller: row.seller_name || 'N/A',
            customer: row.customer_name || 'Anónimo',
            rut: row.customer_rut || 'N/A',
            method: row.payment_method,
            dte: row.dte_status === 'CONFIRMED_DTE' ? `Folio ${row.dte_folio}` : 'Voucher',
            total: Number(row.total_amount)
        }));

        const buffer = await excel.generateReport({
            title: 'Reporte Histórico de Ventas',
            subtitle: `Período: ${startDate} al ${endDate}`,
            locationName: locationId === 'ALL' || !locationId ? 'Todas las Sucursales' : 'Sucursal Específica',
            columns: [
                { header: 'ID Venta', key: 'id', width: 25 },
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Sucursal', key: 'branch', width: 20 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'Cliente', key: 'customer', width: 25 },
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'Medio Pago', key: 'method', width: 15 },
                { header: 'Documento', key: 'dte', width: 15 },
                { header: 'Total ($)', key: 'total', width: 15 }
            ],
            data: data
        });

        const base64 = buffer.toString('base64');
        return { success: true, fileData: base64, fileName: `Ventas_${startDate}_${endDate}.xlsx` };

    } catch (error: any) {
        console.error('Export error:', error);
        return { success: false, error: error.message };
    }
}
