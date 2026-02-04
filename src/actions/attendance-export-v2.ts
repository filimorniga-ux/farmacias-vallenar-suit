'use server';

/**
 * ============================================================================
 * ATTENDANCE-EXPORT-V2: Exportación de Asistencia Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'];

async function getSession(): Promise<{ userId: string; role: string; locationId?: string; userName?: string } | null> {
    try {
        const headersList = await headers();
        const { cookies } = await import('next/headers');

        let userId = headersList.get('x-user-id');
        let role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const userName = headersList.get('x-user-name');

        if (!userId || !role) {
            const cookieStore = await cookies();
            userId = cookieStore.get('user_id')?.value || null;
            role = cookieStore.get('user_role')?.value || null;

            // Location might be in local storage but cookies might have it too if properly set
            // For now we rely on headers or if userId is present we can assume auth is valid mostly.
        }

        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, userName: userName || undefined };
    } catch { return null; }
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
