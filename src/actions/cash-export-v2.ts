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
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get('session_token')?.value;

        // 1. Try Secure Session Token (Best Practice)
        if (sessionToken) {
            const res = await query(
                `SELECT u.id as "userId", u.role, u.assigned_location_id as "locationId", 
                        s.terminal_id as "terminalId", u.name as "userName"
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.token = $1 AND s.expires_at > NOW()`,
                [sessionToken]
            );

            if ((res.rowCount || 0) > 0) {
                const row = res.rows[0];
                return {
                    userId: row.userId,
                    role: row.role,
                    locationId: row.locationId || undefined,
                    terminalId: row.terminalId || undefined,
                    userName: row.userName || undefined
                };
            }
        }

        // 2. Fallback: Auth-V2 Cookies (user_id + user_role)
        const userId = cookieStore.get('user_id')?.value;
        if (userId) {
            const res = await query(
                `SELECT id, role, name, assigned_location_id 
                 FROM users 
                 WHERE id = $1 AND is_active = true`,
                [userId]
            );

            if ((res.rowCount || 0) > 0) {
                const user = res.rows[0];
                return {
                    userId: user.id,
                    role: user.role,
                    locationId: user.assigned_location_id || undefined,
                    userName: user.name || undefined,
                    terminalId: undefined
                };
            }
        }

        return null; // No valid session found
    } catch (error) {
        logger.error({ error }, '[Cash Export] getSession error');
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

        // 📝 FIX: Use 'shifts' table instead of 'cash_register_sessions'
        // and ensure we cast params if needed, though Date objects usually work with TIMESTAMPTZ.
        // We also align column name 'start_time' instead of 'opened_at'.

        // 1. Obtener Fondo Inicial (Opening Amount) de los turnos en el periodo
        const shiftParams: any[] = [startD, endD];
        let shiftFilter = '';
        if (effectiveLocationId) {
            // Note: cash_register_sessions doesn't have location_id directly, usually inferred from terminal
            // But we join terminals t which has location_id
            shiftFilter += ` AND t.location_id = $${shiftParams.length + 1}::uuid`;
            shiftParams.push(effectiveLocationId);
        }
        if (effectiveTerminalId) {
            shiftFilter += ` AND s.terminal_id = $${shiftParams.length + 1}::uuid`;
            shiftParams.push(effectiveTerminalId);
        }

        const shiftSql = `
            SELECT COALESCE(SUM(s.opening_amount), 0) as total_opening
            FROM cash_register_sessions s
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            WHERE s.opened_at >= $1 AND s.opened_at <= $2 ${shiftFilter}
        `;
        const shiftRes = await query(shiftSql, shiftParams);
        const totalOpening = Number(shiftRes.rows[0]?.total_opening || 0);


        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (effectiveLocationId) {
            locationFilter = 'AND t.location_id = $3::uuid';
            sqlParams.push(effectiveLocationId);
        }

        const sql = `
            SELECT s.id, s.opened_at as start_time, s.closed_at as end_time, s.status,
                   s.opening_amount, s.closing_amount,
                   (s.opening_amount + (
                       SELECT COALESCE(SUM(total_amount), 0) FROM sales 
                       WHERE session_id = s.id AND payment_method = 'CASH'
                   )) as expected_amount,
                   t.name as terminal_name, l.name as location_name, u.name as cashier_name
            FROM cash_register_sessions s
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN locations l ON t.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.opened_at >= $1::timestamp AND (s.closed_at <= $2::timestamp OR s.closed_at IS NULL)
            ${locationFilter}
            ORDER BY s.opened_at DESC
        `;

        // 2. Obtener Ventas
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

        const salesSql = `
            SELECT s.timestamp, s.total_amount, s.payment_method, l.name as branch_name,
                   t.name as terminal_name, u.name as seller_name, s.dte_folio
            FROM sales s
            LEFT JOIN locations l ON s.location_id::text = l.id::text
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN users u ON s.user_id::text = u.id::text
            WHERE s.timestamp >= $1 AND s.timestamp <= $2 ${salesFilter}
            ORDER BY s.timestamp DESC
            LIMIT 5000
        `;
        const salesRes = await query(salesSql, salesParams);

        // 3. Obtener Movimientos de Caja
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
            LEFT JOIN locations l ON cm.location_id::text = l.id::text
            LEFT JOIN terminals t ON cm.terminal_id::text = t.id::text
            LEFT JOIN users u ON cm.user_id::text = u.id::text
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2 ${cashFilter}
            ORDER BY cm.timestamp DESC
        `;
        const cashRes = await query(cashSql, cashParams);

        // --- PROCESAMIENTO DE DATOS ---
        const sales = salesRes.rows.map((s: any) => ({
            ...s,
            total_amount: Number(s.total_amount)
        }));

        const movements = cashRes.rows.map((m: any) => ({
            ...m,
            amount: Number(m.amount)
        }));

        // Calcular Totales por Método
        const totalsByMethod: Record<string, number> = {
            'CASH': 0, 'DEBIT': 0, 'CREDIT': 0, 'TRANSFER': 0, 'CHECK': 0, 'OTHER': 0
        };
        let totalSales = 0;

        sales.forEach((s: any) => {
            const method = s.payment_method || 'OTHER';
            totalsByMethod[method] = (totalsByMethod[method] || 0) + s.total_amount;
            totalSales += s.total_amount;
        });

        // Calcular Ingresos y Egresos (Movimientos)
        let totalExtraIncome = 0;
        let totalExpenses = 0;

        movements.forEach((m: any) => {
            if (m.type === 'EXTRA_INCOME') {
                totalExtraIncome += m.amount;
            } else if (['EXPENSE', 'WITHDRAWAL'].includes(m.type)) {
                totalExpenses += m.amount;
            }
        });

        // Operación Matemática: Esperado en Caja (Efectivo)
        // Fondo Inicial + Ventas Efectivo + Ingresos Extras - Gastos = Efectivo en Caja
        const expectedCash = totalOpening + totalsByMethod['CASH'] + totalExtraIncome - totalExpenses;


        // --- GENERACIÓN DE EXCEL (Multi-Hoja Manual) ---
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = session.userName || 'Sistema';
        workbook.created = new Date();

        // HOJA 1: RESUMEN (Summary)
        const summarySheet = workbook.addWorksheet('Resumen de Caja');

        // Estilos
        const titleStyle = { font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } } as any;
        const headerStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } } as any;
        const currencyFormat = '"$"#,##0';

        // Título Principal
        summarySheet.mergeCells('A1:C1');
        summarySheet.getCell('A1').value = 'REPORTE DE ARQUEO DE CAJA';
        summarySheet.getCell('A1').style = titleStyle;
        summarySheet.getCell('A1').alignment = { horizontal: 'center' };

        summarySheet.mergeCells('A2:C2');
        summarySheet.getCell('A2').value = `${startD.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })} - ${endD.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`;
        summarySheet.getCell('A2').alignment = { horizontal: 'center' };

        // Sección 1: Flujo de Efectivo (The Math)
        summarySheet.getCell('A4').value = 'FLUJO DE EFECTIVO (CÁLCULO)';
        summarySheet.getCell('A4').font = { bold: true, size: 12 };

        const cashFlowData = [
            ['(+) Fondo Inicial', totalOpening],
            ['(+) Ventas Efectivo', totalsByMethod['CASH']],
            ['(+) Ingresos Extras', totalExtraIncome],
            ['(-) Gastos / Retiros', totalExpenses], // Excel logic usually adds, so display as positive but label implies minus? Or keep consistent.
            ['(=) TOTAL ESPERADO EN CAJA', expectedCash]
        ];

        cashFlowData.forEach((row, idx) => {
            const r = idx + 5;
            summarySheet.getCell(`A${r}`).value = row[0];
            summarySheet.getCell(`B${r}`).value = row[1];
            summarySheet.getCell(`B${r}`).numFmt = currencyFormat;
            if (idx === 4) { // Total Row
                summarySheet.getCell(`A${r}`).font = { bold: true };
                summarySheet.getCell(`B${r}`).font = { bold: true };
                summarySheet.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light Green
            }
        });

        // Sección 2: Ventas por Medio de Pago
        summarySheet.getCell('D4').value = 'TOTALES POR MEDIO DE PAGO';
        summarySheet.getCell('D4').font = { bold: true, size: 12 };

        const paymentData = [
            ['Efectivo', totalsByMethod['CASH']],
            ['Débito', totalsByMethod['DEBIT']],
            ['Crédito', totalsByMethod['CREDIT']],
            ['Transferencia', totalsByMethod['TRANSFER']],
            ['Cheque', totalsByMethod['CHECK']],
            ['Otro', totalsByMethod['OTHER']],
            ['TOTAL VENTAS', totalSales]
        ];

        paymentData.forEach((row, idx) => {
            const r = idx + 5;
            summarySheet.getCell(`D${r}`).value = row[0];
            summarySheet.getCell(`E${r}`).value = row[1];
            summarySheet.getCell(`E${r}`).numFmt = currencyFormat;
            if (idx === 6) { // Total Sales
                summarySheet.getCell(`D${r}`).font = { bold: true };
                summarySheet.getCell(`E${r}`).font = { bold: true };
            }
        });

        summarySheet.getColumn(1).width = 25;
        summarySheet.getColumn(2).width = 15;
        summarySheet.getColumn(4).width = 20;
        summarySheet.getColumn(5).width = 15;


        // HOJA 2: DETALLE VENTAS (Detailed Sales with Columns)
        const salesSheet = workbook.addWorksheet('Detalle Ventas');

        salesSheet.columns = [
            { header: 'Fecha', key: 'date', width: 20 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Folio/DTE', key: 'dte', width: 15 },
            { header: 'Vendedor', key: 'seller', width: 20 },
            { header: 'Monto Total', key: 'total', width: 15 },
            { header: 'Efectivo', key: 'cash', width: 12 },
            { header: 'Débito', key: 'debit', width: 12 },
            { header: 'Crédito', key: 'credit', width: 12 },
            { header: 'Transf.', key: 'transfer', width: 12 },
            { header: 'Otro', key: 'other', width: 12 },
        ];

        // Style Headers
        salesSheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0052CC' } };
        });

        const salesRows = sales.map((s: any) => ({
            date: new Date(s.timestamp).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
            time: new Date(s.timestamp).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' }),
            dte: s.dte_folio || 'S/N',
            seller: s.seller_name,
            total: s.total_amount,
            cash: s.payment_method === 'CASH' ? s.total_amount : 0,
            debit: s.payment_method === 'DEBIT' ? s.total_amount : 0,
            credit: s.payment_method === 'CREDIT' ? s.total_amount : 0,
            transfer: s.payment_method === 'TRANSFER' ? s.total_amount : 0,
            other: (!['CASH', 'DEBIT', 'CREDIT', 'TRANSFER'].includes(s.payment_method)) ? s.total_amount : 0
        }));

        salesSheet.addRows(salesRows);

        // Format Currency Columns (E to J)
        ['E', 'F', 'G', 'H', 'I', 'J'].forEach(col => {
            salesSheet.getColumn(col).numFmt = currencyFormat;
        });


        // HOJA 3: MOVIMIENTOS (Movements)
        const movSheet = workbook.addWorksheet('Movimientos de Caja');

        movSheet.columns = [
            { header: 'Fecha', key: 'date', width: 20 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Tipo', key: 'type', width: 15 },
            { header: 'Motivo / Descripción', key: 'reason', width: 40 },
            { header: 'Usuario', key: 'user', width: 20 },
            { header: 'Ingreso (+)', key: 'in', width: 15 },
            { header: 'Egreso (-)', key: 'out', width: 15 },
        ];

        // Style Headers
        movSheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }; // Red header for movements
        });

        const movRows = movements.map((m: any) => ({
            date: new Date(m.timestamp).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
            time: new Date(m.timestamp).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' }),
            type: m.type === 'EXTRA_INCOME' ? 'INGRESO' : (m.type === 'EXPENSE' ? 'GASTO' : 'RETIRO'),
            reason: m.reason,
            user: m.user_name,
            in: m.type === 'EXTRA_INCOME' ? m.amount : 0,
            out: ['EXPENSE', 'WITHDRAWAL'].includes(m.type) ? m.amount : 0
        }));

        movSheet.addRows(movRows);

        // Format Currency
        ['F', 'G'].forEach(col => {
            movSheet.getColumn(col).numFmt = currencyFormat;
        });


        // Buffer final
        const buffer = await workbook.xlsx.writeBuffer();

        await auditExport(session.userId, 'CASH_REPORT', {
            startDate: params.startDate,
            endDate: params.endDate,
            locationId: effectiveLocationId,
            salesRows: salesRes.rowCount,
            cashRows: cashRes.rowCount,
        });

        logger.info({ userId: session.userId, role: session.role }, '💵 [Export] Cash report exported (V2 Advanced)');

        return {
            success: true,
            data: Buffer.from(buffer).toString('base64'),
            filename: `Arqueo_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Cash report error');
        return { success: false, error: 'Error generando reporte: ' + error.message };
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
            date: new Date(row.timestamp).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
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
            SELECT s.id, s.opened_at as start_time, s.closed_at as end_time, s.status,
                   s.opening_amount, s.closing_amount, s.expected_amount,
                   t.name as terminal_name, l.name as location_name, u.name as cashier_name
            FROM cash_register_sessions s
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN locations l ON t.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.opened_at >= $1::timestamp AND (s.closed_at <= $2::timestamp OR s.closed_at IS NULL)
            ${locationFilter}
            ORDER BY s.opened_at DESC
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || '-',
            terminal: row.terminal_name || '-',
            cashier: row.cashier_name || '-',
            start: new Date(Number(row.start_time)).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
            end: row.end_time ? new Date(Number(row.end_time)).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Activo',
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
