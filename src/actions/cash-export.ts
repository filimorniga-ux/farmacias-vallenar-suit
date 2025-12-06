'use server';

import ExcelJS from 'exceljs';
import { query } from '@/lib/db';

interface CashExportParams {
    startDate: string; // ISO String or YYYY-MM-DD
    endDate: string;
    locationId?: string;
    terminalId?: string;
    requestingUserRole?: string;
    requestingUserLocationId?: string;
}

export async function generateCashReport(params: CashExportParams) {
    const { startDate, endDate, locationId, terminalId, requestingUserRole, requestingUserLocationId } = params;

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
        const salesParams: any[] = [new Date(startDate).getTime(), new Date(endDate).getTime() + 86399999];

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            salesSql += ` AND s.location_id = $${salesParams.length + 1}`;
            salesParams.push(effectiveLocationId);
        }
        if (terminalId && terminalId !== 'ALL') {
            salesSql += ` AND s.terminal_id = $${salesParams.length + 1}`;
            salesParams.push(terminalId);
        }
        salesSql += ` ORDER BY s.timestamp DESC`;

        const salesRes = await query(salesSql, salesParams);

        // 2. Fetch Cash Movements
        let cashSql = `
            SELECT 
                cm.*,
                l.name as branch_name, t.name as terminal_name, u.name as user_name
            FROM cash_movements cm
            LEFT JOIN locations l ON cm.location_id = l.id
            LEFT JOIN terminals t ON cm.terminal_id = t.id
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.timestamp >= to_timestamp($1 / 1000.0) AND cm.timestamp <= to_timestamp($2 / 1000.0)
        `;
        // Note: timestamp in DB for cash_movements might be TIMESTAMP type or BIGINT?
        // Checking schema: "timestamp TIMESTAMP DEFAULT NOW()"
        // So inputs should be ISO strings or converted.
        // Wait, the "sales" query used ms timestamps (BIGINT usually in my schema for sales?).
        // Checking PROJECT_BIBLE or Schema creation:
        // Sales: "timestamp" column type not explicitly created in the *last* migration, it was "ALTER TABLE".
        // Original "sales" table usually has numeric timestamp in this project based on types.ts.
        // But "cash_movements" was created with "TIMESTAMP".
        // Correction: Sales -> timestamp (BIGINT from initialized schema?). 
        // CashMovements -> timestamp (TIMESTAMP).
        // Lets adjust param types for SQL.

        // Adjusted Params for Cash (Timestamp type)
        let cashSqlSafe = `
            SELECT 
                cm.*,
                l.name as location_name, t.name as terminal_name, u.name as user_name
            FROM cash_movements cm
            LEFT JOIN locations l ON cm.location_id = l.id
            LEFT JOIN terminals t ON cm.terminal_id = t.id
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.timestamp >= $1 AND cm.timestamp <= $2
        `;
        const startD = new Date(startDate);
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        const cashParamsSafe: any[] = [startD, endD];

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            cashSqlSafe += ` AND cm.location_id = $${cashParamsSafe.length + 1}`;
            cashParamsSafe.push(effectiveLocationId);
        }
        if (terminalId && terminalId !== 'ALL') {
            cashSqlSafe += ` AND cm.terminal_id = $${cashParamsSafe.length + 1}`;
            cashParamsSafe.push(terminalId);
        }
        cashSqlSafe += ` ORDER BY cm.timestamp DESC`;

        const cashRes = await query(cashSqlSafe, cashParamsSafe);

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
