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
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import bcrypt from 'bcryptjs';
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
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar flujo de caja' };
    }

    try {
        const flowResult = await getCashFlowLedgerSecure(params);
        if (!flowResult.success || !flowResult.data) {
            return { success: false, error: flowResult.error || 'Error obteniendo datos' };
        }

        const data = flowResult.data.map(row => ({
            date: new Date(row.timestamp).toLocaleString('es-CL'),
            desc: row.description,
            cat: row.category,
            user: row.user_name || 'Sistema',
            in: row.amount_in,
            out: row.amount_out,
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Flujo de Caja Detallado',
            subtitle: `Período: ${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Movimientos',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Descripción', key: 'desc', width: 40 },
                { header: 'Categoría', key: 'cat', width: 15 },
                { header: 'Responsable', key: 'user', width: 20 },
                { header: 'Entrada ($)', key: 'in', width: 15 },
                { header: 'Salida ($)', key: 'out', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'CASH_FLOW', { ...params, rows: data.length });

        logger.info({ userId: session.userId }, '💰 [Export] Cash flow exported');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `FlujoCaja_${params.startDate.split('T')[0]}.xlsx`,
        };

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
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ACCOUNTING_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo contadores y administradores' };
    }

    try {
        const taxResult = await getTaxSummarySecure(month);
        if (!taxResult.success || !taxResult.data) {
            return { success: false, error: taxResult.error || 'Error obteniendo datos' };
        }

        const taxData = taxResult.data;
        const data = [
            { concept: 'Ventas Netas', value: taxData.total_net_sales, detail: 'Base Imponible' },
            { concept: 'IVA Débito (Ventas)', value: taxData.total_vat_debit, detail: 'Impuesto Recaudado' },
            { concept: 'Compras Netas', value: taxData.total_net_purchases, detail: 'Base Imponible' },
            { concept: 'IVA Crédito (Compras)', value: taxData.total_vat_credit, detail: 'Impuesto Soportado' },
            { concept: 'IMPUESTO A PAGAR', value: taxData.estimated_tax_payment, detail: 'Débito - Crédito' },
        ];

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Resumen Tributario (Simulación F29)',
            subtitle: `Período: ${taxData.period}`,
            sheetName: 'Impuestos',
            creator: session.userName,
            columns: [
                { header: 'Concepto', key: 'concept', width: 30 },
                { header: 'Monto ($)', key: 'value', width: 20 },
                { header: 'Detalle', key: 'detail', width: 30 },
            ],
            data,
        });

        await auditExport(session.userId, 'TAX_SUMMARY', { month });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Impuestos_${month || 'actual'}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Tax summary error');
        return { success: false, error: 'Error exportando resumen tributario' };
    }
}

// ============================================================================
// EXPORT PAYROLL - REQUIERE PIN ADMIN
// ============================================================================

/**
 * 👥 Exportar Nómina (ADMIN + PIN OBLIGATORIO)
 */
export async function exportPayrollSecure(
    month: number,
    year: number,
    adminPin: string
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden exportar nómina' };
    }

    if (!adminPin) {
        return { success: false, error: 'Se requiere PIN de administrador para exportar datos de nómina' };
    }

    try {
        // Usar la versión SEGURA con PIN
        const payrollResult = await getPayrollPreviewSecure(month, year, adminPin);
        if (!payrollResult.success || !payrollResult.data) {
            return { success: false, error: payrollResult.error || 'Error obteniendo datos' };
        }

        const data = payrollResult.data.map((p: any) => ({
            rut: p.rut,
            name: p.name,
            role: p.job_title,
            base: p.base_salary,
            afp: p.deductions.afp,
            health: p.deductions.health,
            liquid: p.total_liquid,
        }));

        const totalLiquido = data.reduce((acc: number, curr: any) => acc + curr.liquid, 0);

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Pre-Nómina de Remuneraciones',
            subtitle: `${month}/${year} | Total: $${totalLiquido.toLocaleString('es-CL')}`,
            sheetName: 'Nomina',
            creator: session.userName,
            columns: [
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Nombre', key: 'name', width: 30 },
                { header: 'Cargo', key: 'role', width: 20 },
                { header: 'Sueldo Base', key: 'base', width: 15 },
                { header: 'AFP', key: 'afp', width: 12 },
                { header: 'Salud', key: 'health', width: 12 },
                { header: 'Líquido', key: 'liquid', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'PAYROLL', { month, year, employees: data.length });

        logger.info({ userId: session.userId, month, year }, '👥 [Export] Payroll exported');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Nomina_${month}_${year}.xlsx`,
        };

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
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const ALLOWED_ROLES = [...MANAGER_ROLES, 'RRHH'];
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    // Forzar ubicación para no-admin
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND a.location_id = $3';
            sqlParams.push(locationId);
        }

        const sql = `
            WITH DailyStats AS (
                SELECT user_id, DATE(timestamp) as work_date,
                       MIN(timestamp) as first_in, MAX(timestamp) as last_out
                FROM attendance_logs a
                WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp ${locationFilter}
                GROUP BY user_id, DATE(timestamp)
            )
            SELECT ds.work_date, u.name, u.rut, u.job_title, ds.first_in, ds.last_out
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            ORDER BY ds.work_date DESC, u.name
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: row.work_date.toISOString().split('T')[0],
            name: row.name,
            rut: row.rut,
            role: row.job_title || 'Empleado',
            in: row.first_in ? new Date(row.first_in).toLocaleTimeString('es-CL') : '-',
            out: row.last_out ? new Date(row.last_out).toLocaleTimeString('es-CL') : '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Asistencia',
            subtitle: `${new Date(params.startDate).toLocaleDateString()} - ${new Date(params.endDate).toLocaleDateString()}`,
            sheetName: 'Asistencia',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Nombre', key: 'name', width: 30 },
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Cargo', key: 'role', width: 20 },
                { header: 'Entrada', key: 'in', width: 10 },
                { header: 'Salida', key: 'out', width: 10 },
            ],
            data,
        });

        await auditExport(session.userId, 'ATTENDANCE', { ...params, rows: data.length });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Asistencia_${params.startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Attendance error');
        return { success: false, error: 'Error exportando asistencia' };
    }
}
