'use server';

/**
 * ============================================================================
 * SALES-EXPORT-V2: Exportación de Ventas Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC completo (cajero solo sus ventas, manager ubicación, admin todo)
 * - Auditoría de exportaciones
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{
    userId: string;
    role: string;
    locationId?: string;
    userName?: string;
} | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const userName = headersList.get('x-user-name');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, userName: userName || undefined };
    } catch {
        return null;
    }
}

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'SALES', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// GENERATE SALES REPORT
// ============================================================================

/**
 * 🧾 Generar Reporte de Ventas (RBAC Completo)
 */
export async function generateSalesReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; terminalId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // RBAC
    let effectiveLocationId = params.locationId;
    let userFilter = '';
    const sqlParams: any[] = [new Date(params.startDate), new Date(params.endDate)];

    if (session.role === 'CASHIER') {
        // Cajero: Solo sus propias ventas
        userFilter = ` AND s.user_id = $${sqlParams.length + 1}`;
        sqlParams.push(session.userId);
    } else if (!ADMIN_ROLES.includes(session.role)) {
        // Manager: Solo su ubicación
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

        const data = res.rows.map((row: any) => {
            const d = new Date(row.timestamp);
            return {
                id: row.id,
                date: d.toLocaleDateString('es-CL'),
                time: d.toLocaleTimeString('es-CL'),
                location: row.location_name || '-',
                terminal: row.terminal_name || '-',
                seller: row.seller_name || '-',
                sku: row.sku,
                product: row.product_name,
                qty: Number(row.quantity),
                price: Number(row.price),
                total: Number(row.quantity) * Number(row.price),
                method: row.payment_method,
                dte: row.dte_folio || '-',
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Detalle de Ventas',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Caja', key: 'terminal', width: 15 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Producto', key: 'product', width: 35 },
                { header: 'Cant', key: 'qty', width: 8 },
                { header: 'Precio', key: 'price', width: 12 },
                { header: 'Total', key: 'total', width: 12 },
                { header: 'Pago', key: 'method', width: 12 },
                { header: 'DTE', key: 'dte', width: 10 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_REPORT', { ...params, rows: res.rowCount });

        logger.info({ userId: session.userId, role: session.role, rows: res.rowCount }, '🧾 [Export] Sales report');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Ventas_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Sales report error');
        return { success: false, error: 'Error generando reporte' };
    }
}

// ============================================================================
// EXPORT SALES SUMMARY
// ============================================================================

/**
 * 📊 Resumen de Ventas (MANAGER+)
 */
export async function exportSalesSummarySecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver resumen de ventas' };
    }

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND s.location_id = $3::uuid';
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT 
                DATE(s.timestamp) as date,
                COUNT(DISTINCT s.id) as sales_count,
                SUM(s.total_amount) as total,
                s.payment_method
            FROM sales s
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locationFilter}
            GROUP BY DATE(s.timestamp), s.payment_method
            ORDER BY DATE(s.timestamp) DESC
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: new Date(row.date).toLocaleDateString('es-CL'),
            count: Number(row.sales_count),
            method: row.payment_method,
            total: Number(row.total),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen de Ventas',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Resumen',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Transacciones', key: 'count', width: 15 },
                { header: 'Medio Pago', key: 'method', width: 15 },
                { header: 'Total ($)', key: 'total', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_SUMMARY', params);

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Resumen_Ventas_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Sales summary error');
        return { success: false, error: 'Error generando resumen' };
    }
}
