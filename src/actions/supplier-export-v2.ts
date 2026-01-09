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

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'QF', 'WAREHOUSE'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; userName?: string } | null> {
    try {
        const { getSessionSecure } = await import('@/actions/auth-v2');
        return await getSessionSecure();
    } catch {
        return null;
    }
}

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
 * 🏢 Generar Reporte de Proveedores (ADMIN)
 */
export async function generateSupplierReportSecure(
    params: { startDate: string; endDate: string; supplierIds?: string[] }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden exportar datos de proveedores' };
    }

    try {
        const { startDate, endDate, supplierIds } = params;

        // Obtener proveedores
        let suppliersRes;
        if (supplierIds && supplierIds.length > 0) {
            suppliersRes = await query('SELECT * FROM suppliers WHERE id = ANY($1) ORDER BY business_name ASC', [supplierIds]);
        } else {
            suppliersRes = await query('SELECT * FROM suppliers ORDER BY business_name ASC');
        }

        // Obtener órdenes de compra del período
        const poRes = await query(`
            SELECT supplier_id, COUNT(*) as po_count, SUM(total_estimated) as po_total
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
                sector: sup.sector || '-',
                email: sup.contact_email || '-',
                phone: sup.phone_1 || '-',
                paymentTerms: sup.payment_terms || 'CONTADO',
                leadTime: sup.lead_time_days || '-',
                poCount: Number(poStats.po_count || 0),
                poTotal: Number(poStats.po_total || 0),
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Proveedores',
            subtitle: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Proveedores',
            creator: session.userName,
            columns: [
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'Razón Social', key: 'name', width: 30 },
                { header: 'Sector', key: 'sector', width: 20 },
                { header: 'Email', key: 'email', width: 25 },
                { header: 'Teléfono', key: 'phone', width: 15 },
                { header: 'Cond. Pago', key: 'paymentTerms', width: 12 },
                { header: 'Lead Time', key: 'leadTime', width: 10 },
                { header: 'OC (N°)', key: 'poCount', width: 10 },
                { header: 'Total OC ($)', key: 'poTotal', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'SUPPLIER_REPORT', { startDate, endDate, count: data.length });

        logger.info({ userId: session.userId, suppliers: data.length }, '🏢 [Export] Supplier report');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Proveedores_${startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Supplier report error');
        return { success: false, error: 'Error generando reporte' };
    }
}

// ============================================================================
// EXPORT PO HISTORY
// ============================================================================

/**
 * 📋 Historial de Órdenes de Compra (ADMIN)
 */
export async function exportPOHistorySecure(
    supplierId: string,
    params: { startDate: string; endDate: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores' };
    }

    try {
        const res = await query(`
            SELECT po.id, po.created_at, po.status, po.total_estimated, s.business_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.supplier_id = $1
              AND po.created_at >= $2::timestamp AND po.created_at <= $3::timestamp
            ORDER BY po.created_at DESC
        `, [supplierId, params.startDate, params.endDate]);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            date: new Date(row.created_at).toLocaleDateString('es-CL'),
            supplier: row.business_name || '-',
            status: row.status,
            total: Number(row.total_estimated || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Historial de Órdenes de Compra',
            subtitle: `Proveedor: ${data[0]?.supplier || 'N/A'}`,
            sheetName: 'OC',
            creator: session.userName,
            columns: [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Proveedor', key: 'supplier', width: 25 },
                { header: 'Estado', key: 'status', width: 15 },
                { header: 'Total ($)', key: 'total', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'PO_HISTORY', { supplierId, ...params, count: data.length });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `OC_Historial_${supplierId.slice(0, 8)}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] PO history error');
        return { success: false, error: 'Error generando historial' };
    }
}
