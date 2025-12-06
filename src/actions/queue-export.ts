'use server';

import { query } from '../lib/db';
import ExcelJS from 'exceljs';

export async function exportQueueReport(params: {
    startDate: string,
    endDate: string,
    locationId?: string
}) {
    try {
        const { startDate, endDate, locationId } = params;
        console.log(`📊 Generando reporte de Flujo (Filas)`);

        let sql = `SELECT q.*, l.name as location_name
                   FROM queue_tickets q
                   LEFT JOIN locations l ON q.location_id = l.id
                   WHERE q.created_at >= $1 AND q.created_at <= $2`;

        const sqlParams: any[] = [new Date(startDate), new Date(endDate)];
        let pCount = 3;

        if (locationId) {
            sql += ` AND q.location_id = $${pCount++}`;
            sqlParams.push(locationId);
        }

        sql += ` ORDER BY q.created_at DESC`;

        const result = await query(sql, sqlParams);
        const tickets = result.rows;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Flujo de Atención');

        sheet.columns = [
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Sucursal', key: 'location', width: 20 },
            { header: 'Ticket', key: 'ticket', width: 10 },
            { header: 'RUT Cliente', key: 'rut', width: 15 },
            { header: 'Servicio', key: 'service', width: 15 },
            { header: 'Estado', key: 'status', width: 12 },
        ];

        tickets.forEach(t => {
            const dateObj = new Date(t.created_at);
            sheet.addRow({
                date: dateObj.toLocaleDateString(),
                time: dateObj.toLocaleTimeString(),
                location: t.location_name || t.location_id,
                ticket: t.ticket_number,
                rut: t.customer_rut || 'Anónimo',
                service: t.service_type,
                status: t.status
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, data: base64, filename: `Flujo_Filas_${startDate}.xlsx` };

    } catch (error: any) {
        console.error('Error generating queue report:', error);
        return { success: false, error: error.message };
    }
}
