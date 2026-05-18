'use server';

/**
 * ============================================================================
 * ATTENDANCE-EXPORT-V2: Exportación de Asistencia Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { getValidatedSession } from '@/lib/server-session';
import { getAttendanceReportSecure } from './attendance-report-v2';

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'];

async function getSession(): Promise<{ userId: string; role: string; locationId?: string; userName?: string } | null> {
    const session = await getValidatedSession();
    if (!session) return null;

    return {
        userId: session.userId,
        role: session.role,
        locationId: session.locationId,
        userName: session.userName,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auditExport(userId: string, params: any): Promise<void> {
    try {
        await query(`INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'ATTENDANCE', $2::jsonb, NOW())`, [userId, JSON.stringify(params)]);
    } catch { /* empty */ }
}

/**
 * 📅 Exportar Reporte de Asistencia (MANAGER+/RRHH)
 */
export async function exportAttendanceReportSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers y RRHH pueden exportar asistencia' };
    }

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND a.location_id = $3::uuid';
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT a.*, u.name as user_name, u.rut as user_rut, l.name as location_name
            FROM attendance_logs a
            LEFT JOIN users u ON a.user_id::text = u.id::text
            LEFT JOIN locations l ON a.location_id::text = l.id::text
            WHERE a.timestamp >= $1::timestamp AND a.timestamp <= $2::timestamp ${locationFilter}
            ORDER BY a.timestamp DESC
        `, sqlParams);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.rows.map((log: any) => {
            const ts = new Date(log.timestamp);
            let typeLabel = log.type;
            const t = (log.type || '').toUpperCase();
            if (t === 'IN' || t === 'CHECK_IN') typeLabel = 'Entrada';
            if (t === 'OUT' || t === 'CHECK_OUT') typeLabel = 'Salida';
            if (t.includes('BREAK') || t === 'LUNCH') typeLabel = 'Colación';

            return {
                date: ts.toLocaleDateString('es-CL'),
                time: ts.toLocaleTimeString('es-CL'),
                user: log.user_name || 'Desconocido',
                rut: log.user_rut || '-',
                type: typeLabel,
                location: log.location_name || '-',
                obs: log.observation || '-',
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Asistencia',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Asistencia',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Colaborador', key: 'user', width: 25 },
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'Evento', key: 'type', width: 15 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Observación', key: 'obs', width: 25 },
            ],
            data,
        });

        await auditExport(session.userId, { ...params, rows: res.rowCount });
        logger.info({ userId: session.userId }, '📅 [Export] Attendance report');

        return { success: true, data: buffer.toString('base64'), filename: `Asistencia_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: unknown) {
        logger.error({ error }, '[Export] Attendance error');
        return { success: false, error: 'Error generando reporte' };
    }
}

/**
 * 📊 Exportar Resumen de Asistencia (alineado con HRReportTab)
 */
export async function exportAttendanceSummarySecure(
    params: { startDate: string; endDate: string; locationId?: string; role?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers y RRHH pueden exportar asistencia' };
    }

    try {
        const reportResult = await getAttendanceReportSecure(params);
        if (!reportResult.success || !reportResult.data) {
            return { success: false, error: reportResult.error || 'Error obteniendo resumen de asistencia' };
        }

        const data = reportResult.data.map((row) => ({
            date: new Date(row.date).toLocaleDateString('es-CL'),
            user: row.user_name,
            rut: row.rut || '-',
            role: row.job_title,
            check_in: row.check_in
                ? new Date(row.check_in).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                : '-',
            check_out: row.check_out
                ? new Date(row.check_out).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                : '-',
            hours_worked: row.hours_worked,
            status: row.status,
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen de Asistencia',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Resumen Asistencia',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 14 },
                { header: 'Colaborador', key: 'user', width: 28 },
                { header: 'RUT', key: 'rut', width: 16 },
                { header: 'Cargo', key: 'role', width: 20 },
                { header: 'Entrada', key: 'check_in', width: 12 },
                { header: 'Salida', key: 'check_out', width: 12 },
                { header: 'Horas', key: 'hours_worked', width: 12 },
                { header: 'Estado', key: 'status', width: 12 },
            ],
            data,
        });

        await auditExport(session.userId, { ...params, mode: 'summary', rows: data.length });
        logger.info({ userId: session.userId }, '📊 [Export] Attendance summary');

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `ResumenAsistencia_${params.startDate.split('T')[0]}.xlsx`,
        };
    } catch (error: unknown) {
        logger.error({ error }, '[Export] Attendance summary error');
        return { success: false, error: 'Error generando resumen de asistencia' };
    }
}
