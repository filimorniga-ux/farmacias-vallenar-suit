'use server';

/**
 * ============================================================================
 * QUEUE-EXPORT-V2: Exportación de Filas Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { getSessionSecure } from './auth-v2';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

async function auditExport(userId: string, params: any): Promise<void> {
    try {
        await query(`INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'QUEUE', $2::jsonb, NOW())`, [userId, JSON.stringify(params)]);
    } catch { }
}

/**
 * 🎫 Exportar Reporte de Filas (MANAGER+)
 */
export async function exportQueueReportSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar reportes de filas' };
    }

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [new Date(params.startDate), new Date(params.endDate)];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND q.location_id = $3::uuid';
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT q.*, l.name as location_name
            FROM queue_tickets q
            LEFT JOIN locations l ON q.location_id = l.id
            WHERE q.created_at >= $1 AND q.created_at <= $2 ${locationFilter}
            ORDER BY q.created_at DESC
        `, sqlParams);

        const data = res.rows.map((t: any) => {
            const dateObj = new Date(t.created_at);
            return {
                date: dateObj.toLocaleDateString('es-CL'),
                time: dateObj.toLocaleTimeString('es-CL'),
                location: t.location_name || '-',
                ticket: t.ticket_number,
                rut: t.customer_rut ? '****' + (t.customer_rut || '').slice(-4) : 'Anónimo', // Enmascarado
                service: t.service_type,
                status: t.status,
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Flujo de Atención - Farmacias Vallenar',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Filas',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Ticket', key: 'ticket', width: 10 },
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'Servicio', key: 'service', width: 15 },
                { header: 'Estado', key: 'status', width: 12 },
            ],
            data,
        });

        await auditExport(session.userId, { ...params, rows: res.rowCount });
        logger.info({ userId: session.userId }, '🎫 [Export] Queue report');

        return { success: true, data: buffer.toString('base64'), filename: `Filas_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Queue error');
        return { success: false, error: 'Error generando reporte' };
    }
}
