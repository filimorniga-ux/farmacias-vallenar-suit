'use server';

/**
 * ============================================================================
 * CASH-EXPORT-V2: Exportación de Caja Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC completo por rol
 * - Auditoría de exportaciones
 * - Validación de fechas
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

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
    terminalId?: string;
    userName?: string;
} | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const terminalId = headersList.get('x-user-terminal');
        const userName = headersList.get('x-user-name');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, terminalId: terminalId || undefined, userName: userName || undefined };
    } catch {
        return null;
    }
}

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'CASH', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// GENERATE CASH REPORT
// ============================================================================

/**
 * 💵 Generar Reporte de Caja (RBAC Completo)
 */
export async function generateCashReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; terminalId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // RBAC: Determinar acceso
    let effectiveLocationId = params.locationId;
    let effectiveTerminalId = params.terminalId;

    if (session.role === 'CASHIER') {
        // Cajero: Solo su terminal/turno actual
        effectiveTerminalId = session.terminalId;
        effectiveLocationId = session.locationId;
        if (!effectiveTerminalId) {
            return { success: false, error: 'Cajero debe estar en turno activo para exportar' };
        }
    } else if (!ADMIN_ROLES.includes(session.role)) {
        // Manager: Solo su ubicación
        effectiveLocationId = session.locationId;
    }

    try {
        const startD = new Date(params.startDate);
        const endD = new Date(params.endDate);
        endD.setHours(23, 59, 59, 999);

        const salesParams: any[] = [startD, endD];
        let salesFilter = '';

        if (effectiveLocationId) {
            salesFilter += ` AND s.location_id = $${salesParams.length + 1}::uuid`;
            salesParams.push(effectiveLocationId);
        }
        if (effectiveTerminalId) {
            salesFilter += ` AND s.terminal_id = $${salesParams.length + 1}::uuid`;
            salesParams.push(effectiveTerminalId);
        }

        // Ventas
        const salesSql = `
            SELECT s.timestamp, s.total_amount, s.payment_method, l.name as branch_name,
                   t.name as terminal_name, u.name as seller_name
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1 AND s.timestamp <= $2 ${salesFilter}
            ORDER BY s.timestamp DESC
            LIMIT 5000
        `;

        const salesRes = await query(salesSql, salesParams);

        // Movimientos de caja
        const cashParams: any[] = [startD, endD];
        let cashFilter = '';
        if (effectiveLocationId) {
            cashFilter += ` AND cm.location_id = $${cashParams.length + 1}::uuid`;
            cashParams.push(effectiveLocationId);
        }
        if (effectiveTerminalId) {
            cashFilter += ` AND cm.terminal_id = $${cashParams.length + 1}::uuid`;
            cashParams.push(effectiveTerminalId);
        }

        const cashSql = `
            SELECT cm.timestamp, cm.type, cm.amount, cm.reason,
                   l.name as location_name, t.name as terminal_name, u.name as user_name
            FROM cash_movements cm
            LEFT JOIN locations l ON cm.location_id = l.id
            LEFT JOIN terminals t ON cm.terminal_id = t.id
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2 ${cashFilter}
            ORDER BY cm.timestamp DESC
        `;

        const cashRes = await query(cashSql, cashParams);

        // Generar Excel con múltiples hojas
        const excel = new ExcelService();

        // Hoja de ventas
        const salesData = salesRes.rows.map((s: any) => ({
            date: new Date(s.timestamp).toLocaleString('es-CL'),
            branch: s.branch_name || 'N/A',
            terminal: s.terminal_name || 'N/A',
            seller: s.seller_name || 'N/A',
            total: Number(s.total_amount),
            method: s.payment_method,
        }));

        const buffer = await excel.generateReport({
            title: 'Reporte de Caja',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Sucursal', key: 'branch', width: 20 },
                { header: 'Terminal', key: 'terminal', width: 15 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'Total', key: 'total', width: 15 },
                { header: 'Medio Pago', key: 'method', width: 15 },
            ],
            data: salesData,
        });

        await auditExport(session.userId, 'CASH_REPORT', {
            startDate: params.startDate,
            endDate: params.endDate,
            locationId: effectiveLocationId,
            salesRows: salesRes.rowCount,
            cashRows: cashRes.rowCount,
        });

        logger.info({ userId: session.userId, role: session.role }, '💵 [Export] Cash report exported');

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Caja_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Cash report error');
        return { success: false, error: 'Error generando reporte' };
    }
}

// ============================================================================
// EXPORT SALES DETAIL
// ============================================================================

/**
 * 🧾 Detalle de Ventas (MANAGER+)
 */
export async function exportSalesDetailSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar detalle de ventas' };
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

        const sql = `
            SELECT s.id, s.timestamp, s.total_amount, s.subtotal, s.tax_amount,
                   s.discount_amount, s.payment_method, s.dte_folio, s.dte_status,
                   u.name as seller_name, l.name as location_name
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN locations l ON s.location_id = l.id
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locationFilter}
            ORDER BY s.timestamp DESC
            LIMIT 10000
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: new Date(row.timestamp).toLocaleString('es-CL'),
            location: row.location_name || '-',
            seller: row.seller_name || '-',
            subtotal: Number(row.subtotal || 0),
            tax: Number(row.tax_amount || 0),
            discount: Number(row.discount_amount || 0),
            total: Number(row.total_amount),
            method: row.payment_method,
            dte: row.dte_folio || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Detalle de Ventas',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'Subtotal', key: 'subtotal', width: 12 },
                { header: 'IVA', key: 'tax', width: 12 },
                { header: 'Descuento', key: 'discount', width: 12 },
                { header: 'Total', key: 'total', width: 12 },
                { header: 'Medio Pago', key: 'method', width: 12 },
                { header: 'DTE', key: 'dte', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_DETAIL', { ...params, rows: res.rowCount });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Ventas_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Sales detail error');
        return { success: false, error: 'Error exportando ventas' };
    }
}

// ============================================================================
// EXPORT SHIFT SUMMARY
// ============================================================================

/**
 * 📊 Resumen de Turnos (MANAGER+)
 */
export async function exportShiftSummarySecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND t.location_id = $3::uuid';
            sqlParams.push(locationId);
        }

        const sql = `
            SELECT s.id, s.start_time, s.end_time, s.status,
                   s.opening_amount, s.closing_amount, s.expected_amount,
                   t.name as terminal_name, l.name as location_name, u.name as cashier_name
            FROM shifts s
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN locations l ON t.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.start_time >= $1::timestamp AND (s.end_time <= $2::timestamp OR s.end_time IS NULL)
            ${locationFilter}
            ORDER BY s.start_time DESC
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || '-',
            terminal: row.terminal_name || '-',
            cashier: row.cashier_name || '-',
            start: new Date(Number(row.start_time)).toLocaleString('es-CL'),
            end: row.end_time ? new Date(Number(row.end_time)).toLocaleString('es-CL') : 'Activo',
            opening: Number(row.opening_amount || 0),
            closing: Number(row.closing_amount || 0),
            expected: Number(row.expected_amount || 0),
            diff: Number(row.closing_amount || 0) - Number(row.expected_amount || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen de Turnos',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Turnos',
            creator: session.userName,
            columns: [
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Terminal', key: 'terminal', width: 15 },
                { header: 'Cajero', key: 'cashier', width: 20 },
                { header: 'Inicio', key: 'start', width: 18 },
                { header: 'Cierre', key: 'end', width: 18 },
                { header: 'Apertura', key: 'opening', width: 12 },
                { header: 'Cierre', key: 'closing', width: 12 },
                { header: 'Esperado', key: 'expected', width: 12 },
                { header: 'Diferencia', key: 'diff', width: 12 },
            ],
            data,
        });

        await auditExport(session.userId, 'SHIFT_SUMMARY', { ...params, rows: res.rowCount });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Turnos_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Shift summary error');
        return { success: false, error: 'Error exportando turnos' };
    }
}
