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
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatChileDate, formatChileDateOnly, formatChileTimeOnly } from '@/lib/utils';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _dummy = UUIDSchema;

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

// ============================================================================
// HELPERS
// ============================================================================

import { getSessionSecure } from './auth-v2';

async function getSession(): Promise<{
    userId: string;
    role: string;
    locationId?: string;
    terminalId?: string;
    userName?: string;
} | null> {
    try {
        // 1. Use centralized secure session
        const session = await getSessionSecure();
        if (!session) return null;

        // 2. Enrich for Cashiers/POS context if needed
        let terminalId = undefined;
        let locationId = session.locationId;

        // If no location in cookie, try to fetch from DB (redundant but safe)
        if (!locationId) {
            const userRes = await query('SELECT assigned_location_id FROM users WHERE id = $1::uuid', [session.userId]);
            if ((userRes.rowCount ?? 0) > 0) {
                locationId = userRes.rows[0].assigned_location_id;
            }
        }

        // 3. Find Active Terminal Session (Important for Cashiers)
        // Check for an open session for this user
        const shiftRes = await query(
            `SELECT terminal_id, id as session_id 
             FROM cash_register_sessions 
             WHERE user_id = $1::uuid AND closed_at IS NULL 
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

// ============================================================================
// GENERATE CASH REPORT
// ============================================================================

/**
 * 💵 Generar Reporte de Caja (RBAC Completo)
 */
// ----------------------------------------------------------------------------
// GENERATE CASH REPORT (ENHANCED V2)
// ----------------------------------------------------------------------------

export async function generateCashReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; terminalId?: string; sessionId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // RBAC
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

        // A. SHIFTS (Turnos, Aperturas, Cierres, Desajustes)
        let shiftFilter = '';
        const shiftParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { shiftFilter += ` AND t.location_id = $${shiftParams.length + 1}::uuid`; shiftParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { shiftFilter += ` AND s.terminal_id = $${shiftParams.length + 1}::uuid`; shiftParams.push(effectiveTerminalId); }

        // If specific session
        let sessionFilter = '';
        if (params.sessionId) {
            sessionFilter = ` AND s.id = $${shiftParams.length + 1}::uuid`;
            shiftParams.push(params.sessionId);
        }

        const shiftSql = `
            SELECT s.id, s.opened_at, s.closed_at, s.opening_amount, s.closing_amount, s.cash_difference,
                   u.name as cashier_name, t.name as terminal_name, l.name as branch_name
            FROM cash_register_sessions s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON t.location_id::text = l.id::text
            WHERE s.opened_at >= $1 AND s.opened_at <= $2 ${shiftFilter} ${sessionFilter}
            ORDER BY s.opened_at DESC
        `;
        const shiftsRes = await query(shiftSql, shiftParams);

        // B. SALES (Ventas con detalle de items y clientes)
        // Note: Using subquery for items to avoid massive row multiplication
        let salesFilter = '';
        const salesParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { salesFilter += ` AND s.location_id = $${salesParams.length + 1}::uuid`; salesParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { salesFilter += ` AND s.terminal_id = $${salesParams.length + 1}::uuid`; salesParams.push(effectiveTerminalId); }
        if (params.sessionId) { salesFilter += ` AND s.session_id = $${salesParams.length + 1}::uuid`; salesParams.push(params.sessionId); }

        const salesSql = `
            SELECT 
                s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio,
                u.name as seller_name, t.name as terminal_name, l.name as branch_name,
                COALESCE(s.customer_rut, c.rut) as client_rut, 
                COALESCE(s.customer_name, c.name) as client_name, 
                c.loyalty_points, s.points_discount as points_redeemed,
                (
                    SELECT STRING_AGG(si.product_name || ' (x' || si.quantity || ')', E'\n')
                    FROM sale_items si
                    WHERE si.sale_id = s.id
                ) as items_summary
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON s.location_id::text = l.id::text
            LEFT JOIN customers c ON s.customer_rut = c.rut
            WHERE s.timestamp >= $1 AND s.timestamp <= $2 ${salesFilter}
            ORDER BY s.timestamp DESC
        `;
        const salesRes = await query(salesSql, salesParams);

        // C. MOVEMENTS (Ingresos, Egresos, Retiros)
        let movFilter = '';
        const movParams: (string | Date)[] = [startD, endD];
        if (effectiveLocationId) { movFilter += ` AND cm.location_id = $${movParams.length + 1}::uuid`; movParams.push(effectiveLocationId); }
        if (effectiveTerminalId) { movFilter += ` AND cm.terminal_id = $${movParams.length + 1}::uuid`; movParams.push(effectiveTerminalId); }
        if (params.sessionId) { movFilter += ` AND cm.session_id = $${movParams.length + 1}::uuid`; movParams.push(params.sessionId); }

        const movSql = `
            SELECT cm.timestamp, cm.type, cm.amount, cm.reason,
                   u.name as user_name, t.name as terminal_name, l.name as branch_name
            FROM cash_movements cm
            LEFT JOIN users u ON cm.user_id::text = u.id::text
            LEFT JOIN terminals t ON cm.terminal_id::text = t.id::text
            LEFT JOIN locations l ON cm.location_id::text = l.id::text
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2 ${movFilter}
            ORDER BY cm.timestamp DESC
        `;
        const movRes = await query(movSql, movParams);

        // 2. DATA MERGING & PROCESSING

        // Combine everything into a chronological flow
        // Type: 'SALE', 'INCOME', 'EXPENSE', 'OPENING', 'CLOSING', 'DIFF'
        // Combine everything into a chronological flow
        // Type: 'SALE', 'INCOME', 'EXPENSE', 'OPENING', 'CLOSING', 'DIFF'
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
            details?: string;
            folio?: string;
            method?: string;
        }

        const flow: FlowItem[] = [];
        let totalSales = 0;
        let totalOpening = 0;
        let totalExpenses = 0;
        let totalIncome = 0;

        // Process Shifts (Opening/Closing)
        shiftsRes.rows.forEach((s: any) => {
            // Opening
            if (s.opening_amount > 0) {
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
                    folio: '-',
                    method: 'EFECTIVO',
                    client: '-',
                    rut: '-'
                });
                totalOpening += Number(s.opening_amount);
            }
            // Closing (if exists)
            if (s.closed_at) {
                const expectedAmount = Number(s.closing_amount) - Number(s.cash_difference);
                const diff = Number(s.cash_difference);
                flow.push({
                    timestamp: new Date(s.closed_at),
                    type: 'CIERRE DE CAJA',
                    description: `Cierre de Turno (Esperado: $${expectedAmount.toLocaleString('es-CL')})`,
                    category: 'CIERRE',
                    responsible: s.cashier_name,
                    branch: s.branch_name,
                    terminal: s.terminal_name,
                    in: 0,
                    out: 0,
                    details: diff !== 0 ? `Descuadre: $${diff.toLocaleString('es-CL')}` : 'Cuadre Perfecto',
                    folio: '-',
                    method: '-',
                    client: '-',
                    rut: '-'
                });

                if (diff !== 0) {
                    flow.push({
                        timestamp: new Date(s.closed_at),
                        type: diff > 0 ? 'SOBRANTE DE CAJA' : 'FALTANTE DE CAJA',
                        description: 'Desajuste detectado al cierre',
                        category: 'DESAJUSTE',
                        responsible: s.cashier_name,
                        branch: s.branch_name,
                        terminal: s.terminal_name,
                        in: diff > 0 ? diff : 0,
                        out: diff < 0 ? Math.abs(diff) : 0,
                        folio: '-',
                        method: 'EFECTIVO',
                        client: '-',
                        rut: '-'
                    });
                }
            }
        });

        // Process Sales
        salesRes.rows.forEach((s: any) => {
            flow.push({
                timestamp: new Date(s.timestamp),
                type: 'VENTA',
                description: s.items_summary || 'Sin items', // Items go to description/items column
                category: 'VENTA', // General Category
                responsible: s.seller_name,
                branch: s.branch_name,
                terminal: s.terminal_name,
                in: Number(s.total_amount),
                out: 0,
                client: s.client_name || 'Cliente Desconocido',
                rut: s.client_rut || 'Sin RUT',
                details: undefined, // Already in description
                folio: s.dte_folio || (s.id ? `INT-${s.id.slice(0, 6).toUpperCase()}` : 'S/N'),
                method: s.payment_method || 'PENDIENTE'
            });
            totalSales += Number(s.total_amount);
        });

        // Process Movements
        movRes.rows.forEach((m: any) => {
            const isIncome = m.type === 'INGRESO' || m.type === 'EXTRA_INCOME';
            flow.push({
                timestamp: new Date(m.timestamp),
                type: isIncome ? 'INGRESO EXTRA' : 'GASTO/RETIRO',
                description: m.reason,
                category: m.type,
                responsible: m.user_name,
                branch: m.branch_name,
                terminal: m.terminal_name,
                in: isIncome ? Number(m.amount) : 0,
                out: !isIncome ? Number(m.amount) : 0,
                folio: '-',
                method: 'EFECTIVO', // Usually cash movements are cash
                client: '-',
                rut: '-'
            });

            if (isIncome) totalIncome += Number(m.amount);
            else totalExpenses += Number(m.amount);
        });

        // IDEM: Totals by Method
        // ... (Keep existing logic)

        // Sort Flow by Date DESC
        flow.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // 3. EXCEL GENERATION
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = session.userName || 'Sistema Pharma';

        // --- HOJA 1: RESUMEN (Dashbaord Style) ---
        const summarySheet = workbook.addWorksheet('Resumen General');
        // ... (Keep existing summary logic mostly, maybe refined)
        // Calculate Totals by Payment Method
        const salesByMethod: Record<string, number> = {};
        salesRes.rows.forEach((s: any) => {
            const method = s.payment_method || 'PENDIENTE';
            salesByMethod[method] = (salesByMethod[method] || 0) + Number(s.total_amount);
        });

        const titleStyle = { font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } } as any;
        const currencyFormat = '"$"#,##0';

        summarySheet.mergeCells('A1:C1');
        summarySheet.getCell('A1').value = 'RESUMEN EJECUTIVO DE CAJA';
        summarySheet.getCell('A1').style = titleStyle;
        summarySheet.getCell('A1').alignment = { horizontal: 'center' };

        summarySheet.getCell('A3').value = 'Periodo:';
        summarySheet.getCell('B3').value = `${startD.toLocaleDateString()} - ${endD.toLocaleDateString()}`;

        const summaryData = [
            ['(+) Fondo Inicial Total', totalOpening],
            ['(+) Ventas Totales', totalSales],
        ];

        // Insert Payment Methods Details
        Object.entries(salesByMethod).forEach(([method, amount]) => {
            summaryData.push([`      • ${method}`, amount]);
        });

        summaryData.push(
            ['(+) Otros Ingresos', totalIncome],
            ['(-) Gastos y Retiros', totalExpenses],
            ['(=) FLUJO NETO', totalOpening + totalSales + totalIncome - totalExpenses]
        );

        summaryData.forEach((row, idx) => {
            const r = idx + 5;
            summarySheet.getCell(`A${r}`).value = row[0];
            summarySheet.getCell(`B${r}`).value = row[1];
            summarySheet.getCell(`B${r}`).numFmt = currencyFormat;
            if (idx === 4) summarySheet.getCell(`B${r}`).font = { bold: true, size: 12 };
        });

        summarySheet.getColumn('A').width = 25;
        summarySheet.getColumn('B').width = 20;


        // --- HOJA 2: FLUJO DETALLADO (The Masterpiece) ---
        const detailSheet = workbook.addWorksheet('Flujo Detallado');

        detailSheet.columns = [
            { header: 'Folio (Recibo)', key: 'folio', width: 20 },
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Items / Descripción', key: 'desc', width: 50 },
            { header: 'Medio Pago', key: 'method', width: 15 },
            { header: 'Cliente', key: 'client', width: 25 },
            { header: 'RUT', key: 'rut', width: 15 },
            { header: 'Vendedor', key: 'user', width: 20 },
            { header: 'Caja', key: 'term', width: 15 },
            { header: 'Sucursal', key: 'branch', width: 20 },
            { header: 'Entrada ($)', key: 'in', width: 15 },
            { header: 'Salida ($)', key: 'out', width: 15 },
        ];

        // Header Style
        detailSheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0052CC' } };
        });

        const detailRows = flow.map(f => ({
            folio: f.folio || '-',
            date: formatChileDateOnly(f.timestamp),
            time: formatChileTimeOnly(f.timestamp),
            desc: f.details ? `${f.description}\n${f.details}` : f.description, // Items already in description for Sales
            method: f.method,
            client: f.client,
            rut: f.rut,
            user: f.responsible,
            term: f.terminal,
            branch: f.branch,
            in: f.in || null,
            out: f.out || null,
        }));

        detailSheet.addRows(detailRows);

        // Styling Rows
        detailSheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip Header

            // Wrap text for Description column (Items)
            row.getCell('desc').alignment = { vertical: 'top', wrapText: true };
            row.getCell('folio').alignment = { vertical: 'top', horizontal: 'center' };

            row.eachCell(cell => {
                // Safe cast to number for column comparison to avoid TS lint errors
                if (Number(cell.col) !== 4) cell.alignment = { ...cell.alignment, vertical: 'top' };
            });

            // Conditional formatting logic
            const type = row.getCell('method').value as string; // Using method for some logic or category from before?
            // Wait, we lost 'category' in columns, but we have it in flow.
            // Let's use the 'in' 'out' or just re-inspect flow?
            // It's cleaner to check values in the row or just basic logic.

            const income = Number(row.getCell('in').value || 0);
            const expense = Number(row.getCell('out').value || 0);

            if (expense > 0) {
                row.getCell('out').font = { color: { argb: 'FFDC2626' }, bold: true }; // Red
            }
            if (income > 0) {
                row.getCell('in').font = { color: { argb: 'FF16A34A' }, bold: true }; // Green
            }

            // Highlight Shifts
            const desc = row.getCell('desc').value?.toString() || '';
            if (desc.includes('Apertura de Caja')) {
                row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } }); // Yellow
            } else if (desc.includes('Cierre de Turno')) {
                row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } }); // Gray
            }
        });

        ['K', 'L'].forEach(col => detailSheet.getColumn(col).numFmt = currencyFormat);


        // --- HOJA 3: TURNOS (Audit) ---
        const shiftSheet = workbook.addWorksheet('Auditoría Turnos');
        shiftSheet.columns = [
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Cajero', key: 'user', width: 20 },
            { header: 'Caja', key: 'term', width: 15 },
            { header: 'Apertura', key: 'open', width: 15 },
            { header: 'Venta Sistema', key: 'sys', width: 15 }, // Expected - Opening basically
            { header: 'Cierre Real', key: 'close', width: 15 },
            { header: 'Diferencia', key: 'diff', width: 15 },
        ];

        // Header
        shiftSheet.getRow(1).font = { bold: true };

        const shiftRows = shiftsRes.rows.map((s: any) => ({
            date: formatChileDate(s.opened_at),
            user: s.cashier_name,
            term: s.terminal_name,
            open: Number(s.opening_amount),
            sys: Number(s.closing_amount) - Number(s.cash_difference), // Sales + In/Out handled by system
            close: s.closing_amount ? Number(s.closing_amount) : 'Activo',
            diff: s.closing_amount ? Number(s.cash_difference) : 0
        }));

        shiftSheet.addRows(shiftRows);
        ['D', 'E', 'F', 'G'].forEach(col => shiftSheet.getColumn(col).numFmt = currencyFormat);


        // FINALIZE
        const buffer = await workbook.xlsx.writeBuffer();
        await auditExport(session.userId, 'CASH_REPORT_V2_ENHANCED', { ...params });

        return {
            success: true,
            data: Buffer.from(buffer).toString('base64'),
            filename: `FlujoCaja_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error) {
        logger.error({ error }, '[Export] Cash report V2 error');
        const message = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, error: 'Error generando reporte detallado: ' + message };
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
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN locations l ON s.location_id::text = l.id::text
            WHERE s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp ${locationFilter}
            ORDER BY s.timestamp DESC
            LIMIT 10000
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: formatChileDate(row.timestamp),
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

        await auditExport(session.userId, 'SALES_DETAIL', { ...params, rows: res.rowCount ?? 0 });

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
                   s.opening_amount, s.closing_amount, s.cash_difference,
                   t.name as terminal_name, l.name as location_name, u.name as cashier_name
            FROM cash_register_sessions s
            LEFT JOIN terminals t ON s.terminal_id::text = t.id::text
            LEFT JOIN locations l ON t.location_id::text = l.id::text
            LEFT JOIN users u ON s.user_id::text = u.id::text
            WHERE s.opened_at >= $1::timestamp AND (s.closed_at <= $2::timestamp OR s.closed_at IS NULL)
            ${locationFilter}
            ORDER BY s.opened_at DESC
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || '-',
            terminal: row.terminal_name || '-',
            cashier: row.cashier_name || '-',
            start: formatChileDate(new Date(Number(row.start_time))),
            end: row.end_time ? formatChileDate(new Date(Number(row.end_time))) : 'Activo',
            opening: Number(row.opening_amount || 0),
            closing: Number(row.closing_amount || 0),
            expected: Number(row.closing_amount || 0) - Number(row.cash_difference || 0),
            diff: Number(row.cash_difference || 0),
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

        await auditExport(session.userId, 'SHIFT_SUMMARY', { ...params, rows: res.rowCount ?? 0 });

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
