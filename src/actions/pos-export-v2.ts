'use server';

/**
 * ============================================================================
 * POS-EXPORT-V2: Exportación POS Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

async function getSession(): Promise<{ userId: string; role: string; locationId?: string; userName?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const userName = headersList.get('x-user-name');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, userName: userName || undefined };
    } catch { return null; }
}

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'POS', $2::jsonb, NOW())`, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

/**
 * 🧾 Exportar Historial POS (RBAC)
 */
export async function exportSalesHistorySecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };

    // RBAC
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId && locationId !== 'ALL') {
            locationFilter = 'AND s.location_id = $3::uuid';
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                   l.name as branch_name, u.name as seller_name
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locationFilter}
            ORDER BY s.timestamp DESC LIMIT 5000
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: new Date(row.timestamp).toLocaleString('es-CL'),
            branch: row.branch_name || '-',
            seller: row.seller_name || '-',
            method: row.payment_method,
            dte: row.dte_folio || 'Voucher',
            total: Number(row.total_amount),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Historial de Ventas POS',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID', key: 'id', width: 25 },
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Sucursal', key: 'branch', width: 20 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'Medio Pago', key: 'method', width: 15 },
                { header: 'DTE', key: 'dte', width: 15 },
                { header: 'Total', key: 'total', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'POS_HISTORY', { ...params, rows: res.rowCount });
        logger.info({ userId: session.userId }, '🧾 [Export] POS history');

        return { success: true, data: buffer.toString('base64'), filename: `POS_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] POS error');
        return { success: false, error: 'Error generando reporte' };
    }
}
