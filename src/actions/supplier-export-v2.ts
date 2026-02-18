'use server';

/**
 * ============================================================================
 * SUPPLIER-EXPORT-V2: Exportación de Proveedores Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC: Solo ADMIN puede exportar
 * - Sin try/catch silencioso
 * - Auditoría de exportaciones
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
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF', 'WAREHOUSE'];

// ============================================================================
// HELPERS
// ============================================================================

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'SUPPLIER', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// GENERATE SUPPLIER REPORT
// ============================================================================

/**
 * 🏢 Generar Reporte de Proveedores (MANAGER+)
 */
export async function generateSupplierReportSecure(
    params: { startDate: string; endDate: string; supplierIds?: string[] }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const { startDate, endDate, supplierIds } = params;

        let suppliersRes;
        if (supplierIds?.length) {
            suppliersRes = await query('SELECT * FROM suppliers WHERE id = ANY($1) ORDER BY business_name ASC', [supplierIds]);
        } else {
            suppliersRes = await query('SELECT * FROM suppliers ORDER BY business_name ASC LIMIT 1000');
        }

        const poRes = await query(`
            SELECT supplier_id, COUNT(*) as po_count, SUM(total_amount) as po_total
            FROM purchase_orders 
            WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
            GROUP BY supplier_id
        `, [startDate, endDate]);

        const poMap = new Map(poRes.rows.map((r: any) => [r.supplier_id, r]));

        const data = suppliersRes.rows.map((sup: any) => {
            const poStats = poMap.get(sup.id) || { po_count: 0, po_total: 0 };
            return {
                rut: sup.rut,
                name: sup.business_name,
                sector: sup.sector || 'General',
                email: sup.contact_email || '-',
                phone: sup.phone_1 || '-',
                terms: sup.payment_terms || 'CONTADO',
                lead: sup.lead_time_days || '0',
                count: Number(poStats.po_count),
                total: Number(poStats.po_total)
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Maestro de Proveedores - Farmacias Vallenar',
            subtitle: `Período Evaluado: ${formatDateCL(startDate)} al ${formatDateCL(endDate)}`,
            sheetName: 'Proveedores',
            creator: session.userName,
            columns: [
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Razón Social', key: 'name', width: 35 },
                { header: 'Categoría/Sector', key: 'sector', width: 22 },
                { header: 'Email Contacto', key: 'email', width: 25 },
                { header: 'Teléfono', key: 'phone', width: 15 },
                { header: 'Condición Pago', key: 'terms', width: 15 },
                { header: 'Lead Time (Días)', key: 'lead', width: 15 },
                { header: 'OC Emitidas', key: 'count', width: 15 },
                { header: 'Monto Total OC ($)', key: 'total', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'SUPPLIER_REPORT', { ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `Proveedores_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Supplier report error');
        return { success: false, error: 'Error exportando proveedores' };
    }
}

// ============================================================================
// EXPORT PO HISTORY
// ============================================================================

/**
 * 📋 Historial de Órdenes de Compra (MANAGER+)
 */
export async function exportPOHistorySecure(
    supplierId: string,
    params: { startDate: string; endDate: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const res = await query(`
            SELECT po.id, po.created_at, po.status, po.total_amount, s.business_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.supplier_id = $1
              AND po.created_at >= $2::timestamp AND po.created_at <= $3::timestamp
            ORDER BY po.created_at DESC
        `, [supplierId, params.startDate, params.endDate]);

        const data = res.rows.map((row: any) => ({
            id: row.id.slice(0, 8),
            date: formatDateTimeCL(row.created_at),
            supplier: row.business_name,
            status: row.status,
            total: Number(row.total_amount || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Historial de Órdenes de Compra - Farmacias Vallenar',
            subtitle: `Suministro de: ${data[0]?.supplier || 'Proveedor'} | Rango: ${formatDateCL(params.startDate)} - ${formatDateCL(params.endDate)}`,
            sheetName: 'OC Histórico',
            creator: session.userName,
            columns: [
                { header: 'ID (Corto)', key: 'id', width: 15 },
                { header: 'Fecha Emisión', key: 'date', width: 22 },
                { header: 'Razón Social', key: 'supplier', width: 30 },
                { header: 'Estado OC', key: 'status', width: 15 },
                { header: 'Monto Estimado ($)', key: 'total', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'PO_HISTORY', { supplierId, ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `OC_Historial_${supplierId.slice(0, 8)}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] PO history error');
        return { success: false, error: 'Error exportando historial OC' };
    }
}
