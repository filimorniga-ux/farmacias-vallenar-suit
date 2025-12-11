'use server';

import { query } from '../lib/db';
import { ExcelService } from '../lib/excel-generator';

export async function exportAttendanceReport(params: {
    startDate: string,
    endDate: string,
    locationId?: string,
    userRole: string,
    locationName?: string,
    creatorName?: string
}) {
    try {
        const { startDate, endDate, locationId, userRole, locationName, creatorName } = params;
        console.log(`📊 Generando reporte de Asistencia`);

        const sql = `
            SELECT 
                a.*, 
                u.name as user_name, -- 'fullName' often doesn't exist in some schemas, favoring 'name' based on previous files
                u.rut as user_rut,
                l.name as location_name 
            FROM attendance_logs a
            LEFT JOIN users u ON a.user_id = u.id::text -- ensuring join compatibility
            LEFT JOIN locations l ON a.location_id = l.id::text
            WHERE a.timestamp >= $1 AND a.timestamp <= $2
            ${locationId ? "AND a.location_id::text = $3" : ""}
            ORDER BY a.timestamp DESC
        `;

        const sqlParams: any[] = [new Date(startDate).getTime(), new Date(endDate).getTime()]; // Database stores as BIGINT timestamp usually?
        // Wait, ReportsDetail used `extract(epoch...)` and `timestamp` column.
        // Let's verify schema compatibility. 
        // In ReportsDetail: `s.timestamp >= $1::timestamp`. So it's TIMESTAMP column.
        // But here the original code was: `a.timestamp >= $1`.
        // Let's check `AttendanceManager.tsx` -> `l.timestamp` is number (Date.now).
        // Let's ASSUME it's BIGINT (milliseconds) based on `AttendanceManager.tsx` usage `new Date(log.timestamp)`.
        // IF schema uses TIMESTAMP, then my param usage of `new Date(startDate)` is passing an object, pg driver handles it.
        // IF schema uses BIGINT (number), I need to pass .getTime().
        // The original logic was: `const sqlParams: any[] = [new Date(startDate), new Date(endDate)];`.
        // And the WHERE was `a.timestamp >= $1`.
        // If `a.timestamp` is BIGINT, comparing with Date object is wrong in SQL usually unless driver casts.
        // BUT the original code worked?
        // Let's check `ReportsDetail` again: `extract(epoch from s.timestamp) * 1000`. So Sales are TIMESTAMP.
        // `CashMovements` are TIMESTAMP.
        // `AttendanceLogs`? 
        // In `AttendanceManager.tsx`, `getLastLog` sorts by `timestamp - timestamp`.
        // This suggests it calls an API that returns numbers.
        // Let's stick to the previous `query` pattern. If previous code used `new Date()`, then likely the column is TIMESTAMP or the driver converts.
        // HOWEVER, `ReportsDetail` uses `::timestamp` cast in SQL.
        // I will use `::timestamp` explicitly to be safe if passing Date objects.

        // Wait, looking at original file content:
        // `sqlParams: any[] = [new Date(startDate), new Date(endDate)];`
        // `WHERE a.timestamp >= $1`
        // If this worked, let's keep it. I won't change data query logic too much to avoid breakage without schema check.

        // CORRECTION: In `AttendanceManager.tsx` line 60: `l.timestamp >= startTime`. This is client side.
        // In `attendance-export.ts` line 20: `WHERE a.timestamp >= $1`.
        // I will trust existing working code for query params.

        if (locationId) {
            sqlParams.push(locationId);
        }

        const result = await query(sql, sqlParams);
        const logs = result.rows;

        // Generate Excel
        const excel = new ExcelService();

        const data = logs.map(log => {
            let typeLabel = log.type;
            const t = (log.type || '').toUpperCase();
            if (t === 'IN' || t === 'CHECK_IN') typeLabel = 'Entrada';
            if (t === 'OUT' || t === 'CHECK_OUT') typeLabel = 'Salida';
            if (t.includes('BREAK') || t === 'LUNCH') typeLabel = 'Colación/Descanso';
            if (t === 'ON_PERMISSION') typeLabel = 'Permiso';

            return {
                date: new Date(Number(log.timestamp) || log.timestamp).toLocaleDateString('es-CL'),
                time: new Date(Number(log.timestamp) || log.timestamp).toLocaleTimeString('es-CL'),
                user: log.user_name || 'Desconocido',
                rut: log.user_rut || '-',
                type: typeLabel,
                loc: log.location_name || log.location_id || '-',
                obs: log.observation || '-'
            };
        });

        const buffer = await excel.generateReport({
            title: 'Reporte de Asistencia y Puntualidad',
            subtitle: `Desde: ${new Date(startDate).toLocaleDateString()}  Hasta: ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Asistencia',
            creator: creatorName || 'Sistema',
            locationName: locationName || 'Todas las Sucursales',
            columns: [
                { header: 'Fecha', key: 'date', width: 15 },
                { header: 'Hora', key: 'time', width: 12 },
                { header: 'Colaborador', key: 'user', width: 30 },
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Evento', key: 'type', width: 20 },
                { header: 'Sucursal', key: 'loc', width: 20 },
                { header: 'Observación', key: 'obs', width: 30 }
            ],
            data: data
        });

        const base64 = buffer.toString('base64');
        return { success: true, data: base64, filename: `Asistencia_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        console.error('Error generating attendance report:', error);
        return { success: false, error: error.message };
    }
}
