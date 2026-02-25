'use server';

/**
 * ============================================================================
 * CASH-EXPORT-V2: Exportación de Caja Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * Estandarización Corporativa:
 * - Multi-hoja (Resumen, Flujo, Auditoría)
 * - Zona horaria Santiago (America/Santiago)
 * - Estilos corporativos Vallenar
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL, formatTimeCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _dummy = UUIDSchema;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBRow = any;

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

async function getSession(): Promise<{
    userId: string;
    role: string;
    locationId?: string;
    terminalId?: string;
    userName?: string;
} | null> {
    try {
        const session = await getSessionSecure();
        if (!session) return null;

        let terminalId = undefined;
        let locationId = session.locationId;

        if (!locationId) {
            const userRes = await query('SELECT assigned_location_id FROM users WHERE id::text = $1::text', [session.userId]);
            if ((userRes.rowCount ?? 0) > 0) {
                locationId = userRes.rows[0].assigned_location_id;
            }
        }

        const shiftRes = await query(
            `SELECT terminal_id 
             FROM cash_register_sessions 
             WHERE user_id::text = $1::text AND closed_at IS NULL 
             ORDER BY opened_at DESC LIMIT 1`,
            [session.userId]
        );

        if ((shiftRes.rowCount ?? 0) > 0) {
            terminalId = shiftRes.rows[0].terminal_id;
        }

        return {
            userId: session.userId,
            role: session.role,
            locationId,
            terminalId,
            userName: session.userName
        };
    } catch (error) {
        logger.error({ error }, '[Cash Export] getSession error');
        return null;
    }
}

async function auditExport(userId: string, exportType: string, params: Record<string, unknown>): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1::uuid, 'EXPORT', 'CASH', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch (error) {
        logger.warn({ error }, '[Audit] Export record failed');
    }
}

/**
 * 💵 Generar Reporte de Caja (Multi-hoja Corporativo)
 */
export async function generateCashReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; terminalId?: string; sessionId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };

    let effectiveLocationId = params.locationId;
    let effectiveTerminalId = params.terminalId;

    if (session.role === 'CASHIER') {
        effectiveTerminalId = session.terminalId;
        effectiveLocationId = session.locationId;
        if (!effectiveTerminalId) return { success: false, error: 'Requieres turno activo' };
    } else if (!ADMIN_ROLES.includes(session.role)) {
        effectiveLocationId = session.locationId;
    }

    try {
        const startD = new Date(params.startDate);
        const endD = new Date(params.endDate);
        endD.setHours(23, 59, 59, 999);

        // 1. DATA FETCHING
        let shiftFilter = '';
        const shiftParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { shiftFilter += ` AND t.location_id::text = $${shiftParams.length + 1}::text`; shiftParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { shiftFilter += ` AND s.terminal_id::text = $${shiftParams.length + 1}::text`; shiftParams.push(effectiveTerminalId); }
        if (params.sessionId) { shiftFilter += ` AND s.id::text = $${shiftParams.length + 1}::text`; shiftParams.push(params.sessionId); }

        const shiftsRes = await query(`
            SELECT s.id, s.opened_at, s.closed_at, s.opening_amount, s.closing_amount, s.cash_difference,
                   u.name as cashier_name, t.name as terminal_name, l.name as branch_name
            FROM cash_register_sessions s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON t.location_id::text = l.id::text
            WHERE s.opened_at >= $1 AND s.opened_at <= $2 ${shiftFilter}
            ORDER BY s.opened_at DESC
        `, shiftParams);

        let salesFilter = '';
        const salesParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { salesFilter += ` AND s.location_id::text = $${salesParams.length + 1}::text`; salesParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { salesFilter += ` AND s.terminal_id::text = $${salesParams.length + 1}::text`; salesParams.push(effectiveTerminalId); }
        if (params.sessionId) { salesFilter += ` AND s.session_id::text = $${salesParams.length + 1}::text`; salesParams.push(params.sessionId); }

        const salesRes = await query(`
            SELECT 
                s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                u.name as seller_name, t.name as terminal_name, l.name as branch_name,
                COALESCE(s.customer_rut, c.rut) as client_rut, 
                COALESCE(s.customer_name, c.name) as client_name,
                (SELECT STRING_AGG(si.product_name || ' (x' || si.quantity || ')', E'\n') FROM sale_items si WHERE si.sale_id = s.id) as items_summary
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON s.location_id::text = l.id::text
            LEFT JOIN customers c ON s.customer_rut::text = c.rut::text
            WHERE s.timestamp >= $1 AND s.timestamp <= $2 ${salesFilter}
            ORDER BY s.timestamp DESC
        `, salesParams);

        let movFilter = '';
        const movParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { movFilter += ` AND cm.location_id::text = $${movParams.length + 1}::text`; movParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { movFilter += ` AND cm.terminal_id::text = $${movParams.length + 1}::text`; movParams.push(effectiveTerminalId); }
        if (params.sessionId) { movFilter += ` AND cm.session_id::text = $${movParams.length + 1}::text`; movParams.push(params.sessionId); }

        const movRes = await query(`
            SELECT cm.timestamp, cm.type, cm.amount, cm.reason, u.name as user_name, t.name as terminal_name, l.name as branch_name
            FROM cash_movements cm
            LEFT JOIN users u ON cm.user_id::text = u.id::text
            LEFT JOIN terminals t ON cm.terminal_id::text = t.id::text
            LEFT JOIN locations l ON cm.location_id::text = l.id::text
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2 ${movFilter}
            ORDER BY cm.timestamp DESC
        `, movParams);

        // 2. DATA PROCESSING
        interface FlowItem {
            timestamp: Date;
            type: string;
            description: string;
            category: string;
            responsible: string;
            branch: string;
            terminal: string;
            in: number;
            out: number;
            client?: string;
            rut?: string;
            folio?: string;
            method?: string;
        }

        const flow: FlowItem[] = [];
        let totalSales = 0;
        let totalOpening = 0;
        let totalExpenses = 0;
        let totalIncome = 0;
        const salesByMethod: Record<string, number> = {};

        shiftsRes.rows.forEach((s: any) => {
            if (Number(s.opening_amount) > 0) {
                flow.push({
                    timestamp: new Date(s.opened_at),
                    type: 'FONDO INICIAL',
                    description: 'Apertura de Caja',
                    category: 'APERTURA',
                    responsible: s.cashier_name,
                    branch: s.branch_name,
                    terminal: s.terminal_name,
                    in: Number(s.opening_amount),
                    out: 0,
                    folio: '-', method: 'EFECTIVO', client: '-', rut: '-'
                });
                totalOpening += Number(s.opening_amount);
            }
            if (s.closed_at) {
                const diff = Number(s.cash_difference);
                flow.push({
                    timestamp: new Date(s.closed_at),
                    type: 'CIERRE DE CAJA',
                    description: `Cierre de Turno (Desajuste: $${diff.toLocaleString('es-CL')})`,
                    category: 'CIERRE',
                    responsible: s.cashier_name,
                    branch: s.branch_name,
                    terminal: s.terminal_name,
                    in: 0, out: 0,
                    folio: '-', method: '-', client: '-', rut: '-'
                });
                if (diff !== 0) {
                    flow.push({
                        timestamp: new Date(s.closed_at),
                        type: diff > 0 ? 'SOBRANTE' : 'FALTANTE',
                        description: 'Desajuste detectado al cierre',
                        category: 'DESAJUSTE',
                        responsible: s.cashier_name,
                        branch: s.branch_name,
                        terminal: s.terminal_name,
                        in: diff > 0 ? diff : 0,
                        out: diff < 0 ? Math.abs(diff) : 0,
                        folio: '-', method: 'EFECTIVO', client: '-', rut: '-'
                    });
                }
            }
        });

        salesRes.rows.forEach((s: any) => {
            flow.push({
                timestamp: new Date(s.timestamp),
                type: 'VENTA',
                description: s.items_summary || 'Venta de productos',
                category: 'VENTA',
                responsible: s.seller_name,
                branch: s.branch_name,
                terminal: s.terminal_name,
                in: Number(s.total_amount),
                out: 0,
                client: s.client_name || 'Particular',
                rut: s.client_rut || '1-9',
                folio: s.dte_folio || 'S/N',
                method: s.payment_method || 'EFECTIVO'
            });
            totalSales += Number(s.total_amount);
            salesByMethod[s.payment_method] = (salesByMethod[s.payment_method] || 0) + Number(s.total_amount);
        });

        movRes.rows.forEach((m: any) => {
            const isInc = m.type === 'INGRESO' || m.type === 'EXTRA_INCOME';
            flow.push({
                timestamp: new Date(m.timestamp),
                type: isInc ? 'INGRESO EXTRA' : 'EGRESO/RETIRO',
                description: m.reason,
                category: m.type,
                responsible: m.user_name,
                branch: m.branch_name,
                terminal: m.terminal_name,
                in: isInc ? Number(m.amount) : 0,
                out: !isInc ? Number(m.amount) : 0,
                folio: '-', method: 'EFECTIVO', client: '-', rut: '-'
            });
            if (isInc) totalIncome += Number(m.amount);
            else totalExpenses += Number(m.amount);
        });

        flow.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // 3. EXCEL GENERATION (Multi-Sheet)
        const excel = new ExcelService();
        const buffer = await excel.generateMultiSheetReport({
            creator: session.userName,
            sheets: [
                {
                    name: 'Resumen Ejecutivo',
                    title: 'Resumen de Flujo de Caja - Farmacias Vallenar',
                    columns: [{ header: 'Concepto', key: 'label', width: 35 }, { header: 'Monto ($)', key: 'value', width: 25 }],
                    data: [
                        { label: '(+) Fondo Inicial', value: totalOpening },
                        { label: '(+) Ventas Totales', value: totalSales },
                        ...Object.entries(salesByMethod).map(([m, v]) => ({ label: `   • ${m}`, value: v })),
                        { label: '(+) Otros Ingresos', value: totalIncome },
                        { label: '(-) Egresos y Retiros', value: totalExpenses },
                        { label: '(=) FLUJO NETO', value: totalOpening + totalSales + totalIncome - totalExpenses }
                    ]
                },
                {
                    name: 'Flujo Detallado',
                    title: 'Detalle de Movimientos de Caja - Farmacias Vallenar',
                    columns: [
                        { header: 'Fecha', key: 'date', width: 12 },
                        { header: 'Hora', key: 'time', width: 10 },
                        { header: 'Tipo', key: 'type', width: 15 },
                        { header: 'Descripción', key: 'desc', width: 50 },
                        { header: 'Folio', key: 'folio', width: 15 },
                        { header: 'Cliente', key: 'client', width: 25 },
                        { header: 'Cajero', key: 'user', width: 20 },
                        { header: 'Sucursal', key: 'branch', width: 20 },
                        { header: 'Ingreso', key: 'in', width: 15 },
                        { header: 'Egreso', key: 'out', width: 15 }
                    ],
                    data: flow.map(f => ({
                        date: formatDateCL(f.timestamp),
                        time: formatTimeCL(f.timestamp),
                        type: f.type,
                        desc: f.description,
                        folio: f.folio,
                        client: f.client,
                        user: f.responsible,
                        branch: f.branch,
                        in: f.in || null,
                        out: f.out || null
                    }))
                },
                {
                    name: 'Auditoría de Turnos',
                    title: 'Registro Histórico de Turnos - Farmacias Vallenar',
                    columns: [
                        { header: 'Fecha Apertura', key: 'open_at', width: 22 },
                        { header: 'Fecha Cierre', key: 'close_at', width: 22 },
                        { header: 'Cajero', key: 'user', width: 20 },
                        { header: 'Monto Apertura', key: 'open_amt', width: 15 },
                        { header: 'Monto Cierre', key: 'close_amt', width: 15 },
                        { header: 'Diferencia', key: 'diff', width: 15 }
                    ],
                    data: shiftsRes.rows.map((s: any) => ({
                        open_at: formatDateTimeCL(s.opened_at),
                        close_at: s.closed_at ? formatDateTimeCL(s.closed_at) : 'ABIERTO',
                        user: s.cashier_name,
                        open_amt: Number(s.opening_amount),
                        close_amt: Number(s.closing_amount),
                        diff: Number(s.cash_difference)
                    }))
                }
            ]
        });

        await auditExport(session.userId, 'CASH_REPORT_V2', { ...params });
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Caja_${params.startDate.split('T')[0]}.xlsx`,
        };
    } catch (error: any) {
        logger.error({ error }, '[Export] Cash error');
        return { success: false, error: 'Error exportando caja: ' + error.message };
    }
}

/**
 * 🧾 Detalle de Ventas (MANAGER+)
 */
export async function exportSalesDetailSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: (string | number | Date)[] = [params.startDate, params.endDate];
        let locFilter = '';
        if (locationId) { locFilter = 'AND s.location_id::text = $3::text'; sqlParams.push(locationId); }

        const res = await query(`
            SELECT s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                   u.name as seller_name, l.name as location_name
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN locations l ON s.location_id::text = l.id::text
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locFilter}
            ORDER BY s.timestamp DESC LIMIT 10000
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: formatDateTimeCL(row.timestamp),
            location: row.location_name || '-',
            seller: row.seller_name || '-',
            total: Number(row.total_amount),
            method: row.payment_method,
            dte: row.dte_folio || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Detalle de Ventas - Farmacias Vallenar',
            subtitle: `Período: ${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Ventas',
            creator: session.userName,
            columns: [
                { header: 'ID Venta', key: 'id', width: 25 },
                { header: 'Fecha y Hora', key: 'date', width: 22 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Vendedor', key: 'seller', width: 20 },
                { header: 'Total ($)', key: 'total', width: 15 },
                { header: 'Medio Pago', key: 'method', width: 15 },
                { header: 'Folio DTE', key: 'dte', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SALES_DETAIL', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Ventas_${params.startDate.split('T')[0]}.xlsx` };
    } catch (error) {
        logger.error({ error }, '[Export] Sales detail error');
        return { success: false, error: 'Error exportando ventas' };
    }
}

/**
 * 📊 Resumen de Turnos (MANAGER+)
 */
export async function exportShiftSummarySecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: (string | number | Date)[] = [params.startDate, params.endDate];
        let locFilter = '';
        if (locationId) { locFilter = 'AND t.location_id::text = $3::text'; sqlParams.push(locationId); }

        const res = await query(`
            SELECT s.id, s.opened_at, s.closed_at, s.opening_amount, s.closing_amount, s.cash_difference,
                   t.name as terminal_name, l.name as location_name, u.name as cashier_name
            FROM cash_register_sessions s
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON t.location_id::text = l.id::text
            LEFT JOIN users u ON s.user_id::text = u.id::text
            WHERE s.opened_at >= $1::timestamp AND (s.closed_at <= $2::timestamp OR s.closed_at IS NULL)
            ${locFilter}
            ORDER BY s.opened_at DESC
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || '-',
            terminal: row.terminal_name || '-',
            cashier: row.cashier_name || '-',
            start: formatDateTimeCL(row.opened_at),
            end: row.closed_at ? formatDateTimeCL(row.closed_at) : 'Activo',
            opening: Number(row.opening_amount || 0),
            closing: Number(row.closing_amount || 0),
            expected: Number(row.closing_amount || 0) - Number(row.cash_difference || 0),
            diff: Number(row.cash_difference || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen de Auditoría de Turnos - Farmacias Vallenar',
            subtitle: `Período: ${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Turnos',
            creator: session.userName,
            columns: [
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Terminal', key: 'terminal', width: 15 },
                { header: 'Cajero', key: 'cashier', width: 20 },
                { header: 'Inicio', key: 'start', width: 22 },
                { header: 'Cierre', key: 'end', width: 22 },
                { header: 'Apertura', key: 'opening', width: 15 },
                { header: 'Cierre', key: 'closing', width: 15 },
                { header: 'Esperado', key: 'expected', width: 15 },
                { header: 'Diferencia', key: 'diff', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SHIFT_SUMMARY', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Turnos_${params.startDate.split('T')[0]}.xlsx` };
    } catch (error) {
        logger.error({ error }, '[Export] Shift summary error');
        return { success: false, error: 'Error exportando turnos' };
    }
}
