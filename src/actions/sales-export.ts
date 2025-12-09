'use server';

import ExcelJS from 'exceljs';
import { query } from '@/lib/db';

interface SalesExportParams {
    startDate: string; // ISO or YYYY-MM-DD
    endDate: string;
    locationId?: string;
    terminalId?: string;
    requestingUserRole?: string;
    requestingUserLocationId?: string;
}

export async function generateSalesReport(params: SalesExportParams) {
    const { startDate, endDate, locationId, terminalId, requestingUserRole, requestingUserLocationId } = params;

    // --- SECURITY LOGIC ---
    const isManagerial = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'].includes(requestingUserRole || '');
    let effectiveLocationId = locationId;

    if (!isManagerial) {
        // Force local location for non-managers
        effectiveLocationId = requestingUserLocationId;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        // Query: Sales + Items + Products + Locations + Terminals + Users
        // Note: sales.timestamp is BIGINT in DB? Or TIMESTAMP?
        // Based on `cash-export.ts`, we used `s.timestamp >= $1` assuming similar types.
        // `sales` table usually uses BIGINT for compatibility? Or TIMESTAMP?
        // Let's assume TIMESTAMP for `sales` as per `inventory-export` context? 
        // Wait, `cash-export.ts` used `ORDER BY s.timestamp DESC` and `to_timestamp`?
        // Let's check `sales.ts` insert... `to_timestamp($9 / 1000.0)`. So `sales.timestamp` is TIMESTAMP in DB.

        let sql = `
            SELECT 
                s.id as sale_id,
                s.timestamp,
                s.total_amount,
                s.payment_method,
                s.dte_folio,
                s.customer_rut,
                l.name as location_name,
                t.name as terminal_name,
                u.name as seller_name,
                si.sku,
                si.name as product_name,
                si.quantity,
                si.price as unit_price,
                (si.quantity * si.price) as total_item
                -- categories?
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
        `;

        const startD = new Date(startDate);
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);

        const qParams: any[] = [startD, endD];

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            sql += ` AND s.location_id = $${qParams.length + 1}`;
            qParams.push(effectiveLocationId);
        }

        if (terminalId && terminalId !== 'ALL') {
            sql += ` AND s.terminal_id = $${qParams.length + 1}`;
            qParams.push(terminalId);
        }

        sql += ` ORDER BY s.timestamp DESC`;

        const res = await query(sql, qParams);

        const sheet = workbook.addWorksheet('Detalle de Ventas');

        sheet.columns = [
            { header: 'ID Venta', key: 'id', width: 20 },
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Sucursal', key: 'location', width: 20 },
            { header: 'Caja', key: 'terminal', width: 15 },
            { header: 'Vendedor', key: 'seller', width: 20 },
            { header: 'Cliente RUT', key: 'rut', width: 12 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Producto', key: 'product', width: 40 },
            { header: 'Cantidad', key: 'qty', width: 10 },
            { header: 'P. Unit.', key: 'price', width: 12 },
            { header: 'Total Item', key: 'total_item', width: 12 },
            { header: 'Forma Pago', key: 'pay', width: 15 },
            { header: 'Folio DTE', key: 'dte', width: 10 },
        ];

        // Headers Style
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

        res.rows.forEach(row => {
            const d = new Date(row.timestamp);
            sheet.addRow({
                id: row.sale_id,
                date: d.toLocaleDateString(),
                time: d.toLocaleTimeString(),
                location: row.location_name || 'N/A',
                terminal: row.terminal_name || 'N/A',
                seller: row.seller_name || 'N/A',
                rut: row.customer_rut || '',
                sku: row.sku,
                product: row.product_name,
                qty: Number(row.quantity),
                price: Number(row.unit_price),
                total_item: Number(row.total_item),
                pay: row.payment_method,
                dte: row.dte_folio || ''
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return {
            success: true,
            data: base64,
            filename: `Reporte_Ventas_Detallado_${startDate}.xlsx`
        };

    } catch (error: any) {
        console.error('Error in generateSalesReport:', error);
        return { success: false, error: error.message };
    }
}
