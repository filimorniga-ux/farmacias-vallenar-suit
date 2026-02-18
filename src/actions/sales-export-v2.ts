'use server';

/**
 * ============================================================================
 * SALES-EXPORT-V2: Exportación de Ventas Segura
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
            VALUES ($1, 'EXPORT', 'SALES', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// GENERATE SALES REPORT (DETAILED)
// ============================================================================

/**
 * 🧾 Generar Reporte Detallado de Ventas (MANAGER+)
 */
export async function generateSalesReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; terminalId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    // RBAC: Cajeros solo ven sus ventas, Managers su ubicación, Admins todo
    let effectiveLocationId = params.locationId;
    let userFilter = '';
    const sqlParams: any[] = [params.startDate, params.endDate];

    if (session.role === 'CASHIER') {
        userFilter = ` AND s.user_id = $${sqlParams.length + 1}`;
        sqlParams.push(session.userId);
    } else if (!ADMIN_ROLES.includes(session.role)) {
        effectiveLocationId = session.locationId;
    }

    try {
        let sql = `
            SELECT 
                s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                l.name as location_name, t.name as terminal_name, u.name as seller_name,
                si.sku, si.name as product_name, si.quantity, si.price
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
            ${userFilter}
        `;

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            sql += ` AND s.location_id = $${sqlParams.length + 1}`;
            sqlParams.push(effectiveLocationId);
        }

        if (params.terminalId && params.terminalId !== 'ALL') {
            sql += ` AND s.terminal_id = $${sqlParams.length + 1}`;
            sqlParams.push(params.terminalId);
        }

        sql += ' ORDER BY s.timestamp DESC LIMIT 10000';

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id.slice(0, 8),
            full_id: row.id,
            date: formatDateTimeCL(row.timestamp),
            location: row.location_name || '-',
            terminal: row.terminal_name || '-',
            seller: row.seller_name || '-',
            sku: row.sku,
            product: row.product_name,
            qty: Number(row.quantity),
            price: Number(row.price),
            total: Number(row.quantity) * Number(row.price),
            method: row.payment_method,
            dte: row.dte_folio || 'Voucher',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Transacciones y Artículos - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(params.startDate)} al ${formatDateCL(params.endDate)}`,
            sheetName: 'Detalle Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID (Corto)', key: 'id', width: 12 },
                { header: 'Fecha y Hora', key: 'date', width: 22 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Caja/Terminal', key: 'terminal', width: 15 },
                { header: 'Vendedor', key: 'seller', width: 25 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Descripción Producto', key: 'product', width: 35 },
                { header: 'Cant.', key: 'qty', width: 8 },
                { header: 'Precio Unit. ($)', key: 'price', width: 15 },
                { header: 'Subtotal Item ($)', key: 'total', width: 15 },
                { header: 'Medio de Pago', key: 'method', width: 15 },
                { header: 'Folio DTE', key: 'dte', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_REPORT_DETAIL', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Ventas_Detalle_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Detailed sales error');
        return { success: false, error: 'Error exportando detalle de ventas' };
    }
}

// ============================================================================
// EXPORT SALES SUMMARY
// ============================================================================

/**
 * 📊 Resumen Ejecutivo de Ventas (MANAGER+)
 */
export async function exportSalesSummarySecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (params.locationId && params.locationId !== 'ALL') {
            locationFilter = 'AND s.location_id = $3::uuid';
            sqlParams.push(params.locationId);
        }

        const res = await query(`
            SELECT 
                DATE(s.timestamp) as work_date,
                COUNT(DISTINCT s.id) as trans_count,
                SUM(s.total_amount) as total_val,
                s.payment_method
            FROM sales s
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locationFilter}
            GROUP BY DATE(s.timestamp), s.payment_method
            ORDER BY DATE(s.timestamp) DESC
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: formatDateCL(row.work_date),
            count: Number(row.trans_count),
            method: row.payment_method,
            total: Number(row.total_val),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen Ejecutivo de Ventas - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(params.startDate)} - ${formatDateCL(params.endDate)}`,
            sheetName: 'Resumen Ventas',
            creator: session.userName,
            columns: [
                { header: 'Fecha Contable', key: 'date', width: 15 },
                { header: 'Cant. Transacciones', key: 'count', width: 22 },
                { header: 'Medio de Pago', key: 'method', width: 20 },
                { header: 'Monto Recaudado ($)', key: 'total', width: 22 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_SUMMARY', { ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `Resumen_Ventas_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Sales summary error');
        return { success: false, error: 'Error exportando resumen de ventas' };
    }
}
