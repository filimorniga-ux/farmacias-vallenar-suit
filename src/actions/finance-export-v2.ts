'use server';

/**
 * ============================================================================
 * FINANCE-EXPORT-V2: Exportación Financiera Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES CRÍTICAS:
 * - Usa getPayrollPreviewSecure con PIN (NO getPayrollPreview viejo)
 * - RBAC por tipo de reporte
 * - Auditoría de exportaciones
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL, formatTimeCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

// Importar versiones SEGURAS
import { getCashFlowLedgerSecure, getTaxSummarySecure, getPayrollPreviewSecure } from './reports-detail-v2';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const ACCOUNTING_ROLES = ['CONTADOR', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'];

// ============================================================================
// HELPERS
// ============================================================================

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'FINANCE', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// EXPORT CASH FLOW
// ============================================================================

/**
 * 💰 Exportar Flujo de Caja (MANAGER+)
 */
export async function exportCashFlowSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const flowResult = await getCashFlowLedgerSecure(params);
        if (!flowResult.success || !flowResult.data) {
            return { success: false, error: flowResult.error || 'Error obteniendo datos' };
        }

        const data = flowResult.data.map(row => ({
            date: formatDateTimeCL(row.timestamp),
            desc: row.description,
            cat: row.category,
            user: row.user_name || 'Sistema',
            in: row.amount_in,
            out: row.amount_out,
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Libro Auxiliar de Flujo de Caja - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(params.startDate)} - ${formatDateCL(params.endDate)}`,
            sheetName: 'Movimientos',
            creator: session.userName,
            columns: [
                { header: 'Fecha y Hora', key: 'date', width: 22 },
                { header: 'Descripción del Movimiento', key: 'desc', width: 45 },
                { header: 'Categoría', key: 'cat', width: 18 },
                { header: 'Responsable', key: 'user', width: 20 },
                { header: 'Ingreso ($)', key: 'in', width: 15 },
                { header: 'Egreso ($)', key: 'out', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'CASH_FLOW', { ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `FlujoCaja_${params.startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Cash flow error');
        return { success: false, error: 'Error exportando flujo de caja' };
    }
}

// ============================================================================
// EXPORT TAX SUMMARY
// ============================================================================

/**
 * 📊 Exportar Resumen Tributario (ADMIN/CONTADOR)
 */
export async function exportTaxSummarySecure(
    month?: string
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ACCOUNTING_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const taxResult = await getTaxSummarySecure(month);
        if (!taxResult.success || !taxResult.data) {
            return { success: false, error: taxResult.error || 'Error obteniendo datos' };
        }

        const taxData = taxResult.data;
        const data = [
            { concept: 'Ventas Netas Totales', value: taxData.total_net_sales, detail: 'Base Imponible Ventas' },
            { concept: 'IVA Débito Fiscal (19%)', value: taxData.total_vat_debit, detail: 'Impuesto por Ventas' },
            { concept: 'Compras Netas Totales', value: taxData.total_net_purchases, detail: 'Base Imponible Compras' },
            { concept: 'IVA Crédito Fiscal (19%)', value: taxData.total_vat_credit, detail: 'Impuesto Soportado' },
            { concept: 'ESTIMADO F29 A PAGAR', value: taxData.estimated_tax_payment, detail: 'Débito - Crédito' },
        ];

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen Tributario Consolidado - Farmacias Vallenar',
            subtitle: `Período Fiscal: ${taxData.period}`,
            sheetName: 'Impuestos',
            creator: session.userName,
            columns: [
                { header: 'Concepto Tributario', key: 'concept', width: 35 },
                { header: 'Monto Acumulado ($)', key: 'value', width: 25 },
                { header: 'Observaciones / Detalle', key: 'detail', width: 35 },
            ],
            data,
        });

        await auditExport(session.userId, 'TAX_SUMMARY', { month });
        return { success: true, data: buffer.toString('base64'), filename: `Impuestos_${month || 'actual'}.xlsx` };
    } catch (error: any) {
        logger.error({ error }, '[Export] Tax summary error');
        return { success: false, error: 'Error exportando resumen tributario' };
    }
}

// ============================================================================
// EXPORT PAYROLL
// ============================================================================

/**
 * 👥 Exportar Nómina (ADMIN + PIN)
 */
export async function exportPayrollSecure(
    month: number,
    year: number,
    adminPin: string
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ADMIN_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const payrollResult = await getPayrollPreviewSecure(month, year, adminPin);
        if (!payrollResult.success || !payrollResult.data) {
            return { success: false, error: payrollResult.error || 'Error obteniendo datos' };
        }

        const data = payrollResult.data.map((p: any) => ({
            rut: p.rut,
            name: p.name,
            role: p.job_title,
            base: Number(p.base_salary),
            afp: Number(p.deductions.afp),
            health: Number(p.deductions.health),
            liquid: Number(p.total_liquid),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Libro de Remuneraciones - Farmacias Vallenar',
            subtitle: `Mes: ${month}/${year} | Nómina General Vallenar`,
            sheetName: 'Remuneraciones',
            creator: session.userName,
            columns: [
                { header: 'RUT Colaborador', key: 'rut', width: 15 },
                { header: 'Nombre Completo', key: 'name', width: 35 },
                { header: 'Cargo', key: 'role', width: 20 },
                { header: 'Sueldo Base ($)', key: 'base', width: 15 },
                { header: 'Dcto. AFP ($)', key: 'afp', width: 15 },
                { header: 'Dcto. Salud ($)', key: 'health', width: 15 },
                { header: 'Sueldo Líquido ($)', key: 'liquid', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'PAYROLL', { month, year, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `Remuneraciones_${month}_${year}.xlsx` };
    } catch (error: any) {
        logger.error({ error }, '[Export] Payroll error');
        return { success: false, error: 'Error exportando nómina' };
    }
}

// ============================================================================
// EXPORT ATTENDANCE
// ============================================================================

/**
 * 📅 Exportar Asistencia (MANAGER+)
 */
export async function exportAttendanceSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    const ALLOWED_ROLES = [...MANAGER_ROLES, 'RRHH'];
    if (!ALLOWED_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) locationId = session.locationId;

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locFilter = '';
        if (locationId) { locFilter = 'AND a.location_id = $3'; sqlParams.push(locationId); }

        const res = await query(`
            WITH DailyStats AS (
                SELECT user_id, DATE(timestamp) as work_date,
                       MIN(timestamp) as first_in, MAX(timestamp) as last_out,
                       (SELECT name FROM locations WHERE id = a.location_id) as loc_name
                FROM attendance_logs a
                WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp ${locFilter}
                GROUP BY user_id, DATE(timestamp), location_id
            )
            SELECT ds.work_date, u.name, u.rut, u.job_title, ds.first_in, ds.last_out, ds.loc_name
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            ORDER BY ds.work_date DESC, u.name
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: formatDateCL(row.work_date),
            name: row.name,
            rut: row.rut,
            role: row.job_title || 'Colaborador',
            branch: row.loc_name || '-',
            in: row.first_in ? formatTimeCL(new Date(row.first_in)) : '-',
            out: row.last_out ? formatTimeCL(new Date(row.last_out)) : '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Control de Asistencia de Personal - Farmacias Vallenar',
            subtitle: `Período: ${formatDateCL(params.startDate)} al ${formatDateCL(params.endDate)}`,
            sheetName: 'Asistencia',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Colaborador', key: 'name', width: 30 },
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Cargo', key: 'role', width: 20 },
                { header: 'Sucursal', key: 'branch', width: 18 },
                { header: 'Entrada', key: 'in', width: 12 },
                { header: 'Salida', key: 'out', width: 12 },
            ],
            data,
        });

        await auditExport(session.userId, 'ATTENDANCE', { ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `Asistencia_${params.startDate.split('T')[0]}.xlsx` };
    } catch (error: any) {
        logger.error({ error }, '[Export] Attendance error');
        return { success: false, error: 'Error exportando asistencia' };
    }
}

