'use server';

import ExcelJS from 'exceljs';
import { query } from '@/lib/db';

import { ShiftMetricsDetailed } from './cash-management';

interface CashExportParams {
    startDate: string; // ISO String or YYYY-MM-DD
    endDate: string;
    locationId?: string;
    terminalId?: string;
    requestingUserRole?: string;
    requestingUserLocationId?: string;
    shiftMetrics?: ShiftMetricsDetailed; // New optional param
}

export async function generateCashReport(params: CashExportParams) {
    const { startDate, endDate, locationId, terminalId, requestingUserRole, requestingUserLocationId, shiftMetrics } = params;

    // --- SECURITY LOGIC ---
    const isManagerial = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'].includes(requestingUserRole || '');
    let effectiveLocationId = locationId;

    if (!isManagerial && requestingUserLocationId) {
        effectiveLocationId = requestingUserLocationId; // Enforce local data only
    }

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        // 1. Fetch Sales
        // 1. Fetch Sales
        // FIX: User reported "date/time field value out of range".
        // This implies database columns are TIMESTAMP, but we were sending milliseconds (BIGINT).
        // Postgres interprets numbers as seconds or tries to parse them? 
        // If s.timestamp is TIMESTAMP, we should pass Date objects or ISO strings.
        let salesSql = `
            SELECT 
                s.id, s.timestamp, s.total_amount, s.payment_method, s.dte_folio, s.dte_status,
                l.name as branch_name, t.name as terminal_name, u.name as seller_name,
                s.customer_rut
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.timestamp >= $1 AND s.timestamp <= $2
        `;

        // Helper: Ensure we have valid Date objects from the input string (which might be ms string or iso string)
        const parseDateParam = (val: string | number) => {
            // If strictly numeric string like "1766164011457"
            if (!isNaN(Number(val)) && String(val).length > 10) {
                return new Date(Number(val));
            }
            return new Date(val);
        };

        const startD = parseDateParam(startDate);
        const endD = parseDateParam(endDate);

        // Create boundaries
        // For start date, ensure it starts at 00:00:00 if just a date is passed, or use exact time
        // The UI usually sends YYYY-MM-DD or full ISO. 
        // Let's ensure start of day coverage if it's just a date, but usually the UI handles time?
        // User request: "Conversión de Input... new Date(Number(val))..."

        // We'll use the Date objects directly.
        // For End Date, we want to cover the full day if it's just a date.
        // Since we are fixing a crash, let's treat them as Dates.
        // If the query is failing on "out of range", it's definitely receiving a number for a TIMESTAMP column.

        const salesParams: any[] = [startD, endD]; // Pass Date objects, let 'pg' driver handle serialization

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            salesSql += ` AND s.location_id = $${salesParams.length + 1}::uuid`;
            salesParams.push(effectiveLocationId);
        }
        if (terminalId && terminalId !== 'ALL') {
            salesSql += ` AND s.terminal_id = $${salesParams.length + 1}::uuid`;
            salesParams.push(terminalId);
        }
        salesSql += ` ORDER BY s.timestamp DESC`;

        const salesRes = await query(salesSql, salesParams);

        // 2. Fetch Cash Movements
        let cashSql = `
            SELECT 
                cm.*,
                l.name as location_name, 
                COALESCE(t.name, t_session.name) as terminal_name, 
                u.name as user_name
            FROM cash_movements cm
            LEFT JOIN locations l ON cm.location_id = l.id
            LEFT JOIN terminals t ON cm.terminal_id = t.id
            LEFT JOIN cash_register_sessions crs ON cm.location_id = crs.id 
            LEFT JOIN terminals t_session ON crs.terminal_id = t_session.id
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2
        `;

        const cashParams: any[] = [startD, endD];

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            cashSql += ` AND (cm.location_id = $${cashParams.length + 1}::uuid OR crs.location_id = $${cashParams.length + 1}::uuid)`;
            cashParams.push(effectiveLocationId);
        }
        if (terminalId && terminalId !== 'ALL') {
            cashSql += ` AND (cm.terminal_id = $${cashParams.length + 1}::uuid OR crs.terminal_id = $${cashParams.length + 1}::uuid)`;
            cashParams.push(terminalId);
        }
        cashSql += ` ORDER BY cm.timestamp DESC`;

        const cashRes = await query(cashSql, cashParams);

        // ---------------------------------------------------------
        // SHEET 0: RESUMEN ARQUEO (If provided)
        // ---------------------------------------------------------
        if (shiftMetrics) {
            const summarySheet = workbook.addWorksheet('Resumen Arqueo');
            summarySheet.columns = [
                { header: 'Concepto', key: 'concept', width: 30 },
                { header: 'Detalle', key: 'detail', width: 20 },
                { header: 'Monto', key: 'amount', width: 15 },
                { header: 'Cantidad', key: 'count', width: 10 }
            ];

            summarySheet.addRow({ concept: 'FONDO INICIAL', amount: shiftMetrics.opening_amount });
            summarySheet.addRow({}); // spacer

            summarySheet.addRow({ concept: 'VENTAS POR MEDIO' });
            shiftMetrics.sales_breakdown.forEach(item => {
                summarySheet.addRow({
                    concept: '',
                    detail: item.method,
                    amount: item.total,
                    count: item.count
                });
            });
            summarySheet.addRow({ concept: 'TOTAL VENTAS', amount: shiftMetrics.sales_breakdown.reduce((s, i) => s + i.total, 0) });
            summarySheet.addRow({}); // spacer

            summarySheet.addRow({ concept: 'MOVIMIENTOS MANUALES' });
            summarySheet.addRow({ concept: '', detail: 'Ingresos (+)', amount: shiftMetrics.manual_movements.total_in });
            summarySheet.addRow({ concept: '', detail: 'Salidas (-)', amount: shiftMetrics.manual_movements.total_out });

            summarySheet.addRow({}); // spacer
            summarySheet.addRow({ concept: 'CAJA ESPERADA', amount: shiftMetrics.expected_cash });
        }

        // ---------------------------------------------------------
        // SHEET 1: VENTAS (Consolidado)
        // ---------------------------------------------------------
        const salesSheet = workbook.addWorksheet('Ventas');
        salesSheet.columns = [
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Sucursal', key: 'branch', width: 20 },
            { header: 'Caja', key: 'term', width: 15 },
            { header: 'Vendedor', key: 'seller', width: 20 },
            { header: 'Total', key: 'total', width: 15 },
            { header: 'Medio Pago', key: 'method', width: 15 },
            { header: 'DTE', key: 'dte', width: 15 }
        ];

        // Sales timestamps are likely BIGINT (ms) based on legacy code patterns
        salesRes.rows.forEach(s => {
            salesSheet.addRow({
                date: new Date(Number(s.timestamp)).toLocaleString(),
                branch: s.branch_name || 'N/A',
                term: s.terminal_name || 'N/A',
                seller: s.seller_name || 'N/A',
                total: s.total_amount,
                method: s.payment_method,
                dte: s.dte_folio || 'N/A'
            });
        });

        // ---------------------------------------------------------
        // SHEET 2: MOVIMIENTOS CAJA
        // ---------------------------------------------------------
        const cashSheet = workbook.addWorksheet('Flujo de Caja');
        cashSheet.columns = [
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Sucursal', key: 'branch', width: 20 },
            { header: 'Caja', key: 'term', width: 15 },
            { header: 'Usuario', key: 'user', width: 20 },
            { header: 'Tipo', key: 'type', width: 10 },
            { header: 'Monto', key: 'amount', width: 15 },
            { header: 'Motivo', key: 'reason', width: 20 },
            { header: 'Descripción', key: 'desc', width: 30 }
        ];

        cashRes.rows.forEach(cm => {
            cashSheet.addRow({
                date: new Date(cm.timestamp).toLocaleString(),
                branch: cm.location_name || 'N/A',
                term: cm.terminal_name || 'N/A',
                user: cm.user_name || 'N/A',
                type: cm.type,
                amount: cm.amount,
                reason: cm.reason,
                desc: cm.description
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return { success: true, fileData: base64, fileName: `Reporte_Caja_Seguro_${startDate}.xlsx` };

    } catch (error: any) {
        console.error('Error generating cash report:', error);
        return { success: false, error: 'Database Error: ' + error.message };
    }
}
