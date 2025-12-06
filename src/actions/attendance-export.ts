'use server';

import { query } from '../lib/db';
import ExcelJS from 'exceljs';

export async function exportAttendanceReport(params: {
    startDate: string,
    endDate: string,
    locationId?: string,
    userRole: string
}) {
    try {
        const { startDate, endDate, locationId, userRole } = params;
        console.log(`📊 Generando reporte de Asistencia`);

        let sql = `SELECT a.*, u."fullName" as user_name, l.name as location_name
                   FROM attendance_logs a
                   LEFT JOIN users u ON a.user_id = u.id
                   LEFT JOIN locations l ON a.location_id = l.id
                   WHERE a.timestamp >= $1 AND a.timestamp <= $2`;

        const sqlParams: any[] = [new Date(startDate), new Date(endDate)];
        let pCount = 3;

        // Security: If not Manager/Admin, enforce location? 
        // Logic handled by caller usually, but we can double check.
        // If locationId provided, filter by it.
        if (locationId) {
            sql += ` AND a.location_id = $${pCount++}`;
            sqlParams.push(locationId);
        }

        sql += ` ORDER BY a.timestamp DESC`;

        const result = await query(sql, sqlParams);
        const logs = result.rows;

        // Generate Excel
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Asistencia');

        sheet.columns = [
            { header: 'Fecha/Hora', key: 'timestamp', width: 20 },
            { header: 'Colaborador', key: 'user', width: 25 },
            { header: 'Tipo', key: 'type', width: 15 },
            { header: 'Sucursal', key: 'location', width: 20 },
            { header: 'Método', key: 'method', width: 10 },
        ];

        logs.forEach(log => {
            let typeLabel = log.type;
            if (typeLabel === 'CHECK_IN') typeLabel = 'Entrada';
            if (typeLabel === 'CHECK_OUT') typeLabel = 'Salida';
            if (typeLabel === 'BREAK_START') typeLabel = 'Inicio Colación';
            if (typeLabel === 'BREAK_END') typeLabel = 'Fin Colación';

            sheet.addRow({
                timestamp: new Date(log.timestamp).toLocaleString(),
                user: log.user_name || 'Desconocido',
                type: typeLabel,
                location: log.location_name || log.location_id,
                method: log.method
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, data: base64, filename: `Asistencia_${startDate}.xlsx` };

    } catch (error: any) {
        console.error('Error generating attendance report:', error);
        return { success: false, error: error.message };
    }
}
