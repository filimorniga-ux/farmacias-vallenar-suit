'use server';

/**
 * ============================================================================
 * POS-EXPORT-V2: Exportación POS Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

// ============================================================================
// HELPERS
// ============================================================================

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'POS', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// EXPORT POS HISTORY
// ============================================================================

/**
 * 🧾 Historial de Ventas POS (MANAGER+)
 */
export async function exportSalesHistorySecure(
    params: { startDate: string; endDate: string; locationId?: string; paymentMethod?: string; searchTerm?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let whereClause = 'WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp';
        let paramIndex = 3;

        if (locationId && locationId !== 'ALL') {
            whereClause += ` AND s.location_id = $${paramIndex}::uuid`;
            sqlParams.push(locationId);
            paramIndex++;
        }

        if (params.paymentMethod && params.paymentMethod !== 'ALL') {
            whereClause += ` AND s.payment_method = $${paramIndex}`;
            sqlParams.push(params.paymentMethod);
            paramIndex++;
        }

        if (params.searchTerm) {
            whereClause += ` AND (
                s.id::text ILIKE $${paramIndex} OR 
                s.dte_folio::text ILIKE $${paramIndex} OR
                u.name ILIKE $${paramIndex} OR
                s.customer_name ILIKE $${paramIndex}
            )`;
            sqlParams.push(`%${params.searchTerm}%`);
            paramIndex++;
        }

        const res = await query(`
            SELECT s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                   l.name as branch_name, u.name as seller_name
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            ${whereClause}
            ORDER BY s.timestamp DESC LIMIT 5000
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: formatDateTimeCL(row.timestamp),
            branch: row.branch_name || '-',
            seller: row.seller_name || '-',
            method: row.payment_method,
            dte: row.dte_folio || 'Voucher',
            total: Number(row.total_amount),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Control de Ventas POS - Farmacias Vallenar',
            subtitle: `Filtrado desde: ${formatDateCL(params.startDate)} hasta: ${formatDateCL(params.endDate)}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID Venta', key: 'id', width: 30 },
                { header: 'Fecha y Hora', key: 'date', width: 22 },
                { header: 'Sucursal/Punto de Venta', key: 'branch', width: 25 },
                { header: 'Vendedor Responsable', key: 'seller', width: 25 },
                { header: 'Medio Pago', key: 'method', width: 15 },
                { header: 'Folio DTE', key: 'dte', width: 15 },
                { header: 'Monto Total ($)', key: 'total', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'POS_HISTORY', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `POS_Ventas_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] POS history error');
        return { success: false, error: 'Error exportando historial POS' };
    }
}

