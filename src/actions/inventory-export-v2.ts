'use server';

/**
 * ============================================================================
 * INVENTORY-EXPORT-V2: Exportación de Inventario Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC: MANAGER su ubicación, ADMIN todo
 * - Auditoría de cada exportación
 * - Validación de fechas
 * - Límite configurable
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
const DateSchema = z.string().refine(val => !isNaN(Date.parse(val)), 'Fecha inválida');

const ExportParamsSchema = z.object({
    startDate: DateSchema,
    endDate: DateSchema,
    locationId: UUIDSchema.optional(),
    limit: z.number().min(1).max(10000).default(5000),
});

const InventoryReportSchema = z.object({
    locationId: UUIDSchema.optional(),
    warehouseId: UUIDSchema.optional(),
    type: z.enum(['kardex', 'seed']).default('seed'),
});

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
            VALUES ($1, 'EXPORT', 'INVENTORY', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch { }
}

// ============================================================================
// EXPORT STOCK MOVEMENTS
// ============================================================================

/**
 * 📦 Exportar Movimientos de Stock (MANAGER+)
 */
export async function exportStockMovementsSecure(
    params: z.infer<typeof ExportParamsSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    const validated = ExportParamsSchema.safeParse(params);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const { startDate, endDate, limit } = validated.data;
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [startDate, endDate];
        let whereClause = 'WHERE sm.timestamp >= $1::timestamp AND sm.timestamp <= $2::timestamp';

        if (locationId) {
            whereClause += ` AND sm.location_id = $3::uuid`;
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT 
                sm.timestamp, sm.movement_type, sm.quantity, sm.stock_after,
                sm.notes, sm.product_name, sm.sku, u.name as user_name, u.rut as user_rut, 
                l.name as location_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id = u.id
            LEFT JOIN locations l ON sm.location_id = l.id
            ${whereClause}
            ORDER BY sm.timestamp DESC
            LIMIT $${sqlParams.length + 1}
        `, [...sqlParams, limit]);

        const data = res.rows.map((row: any) => ({
            date: formatDateTimeCL(row.timestamp),
            type: row.movement_type,
            sku: row.sku,
            product: row.product_name,
            qty: Number(row.quantity),
            stock: Number(row.stock_after),
            user: row.user_name ? `${row.user_name} (${row.user_rut || '-'})` : 'Sistema',
            location: row.location_name || '-',
            notes: row.notes || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Kardex Consolidado de Movimientos - Farmacias Vallenar',
            subtitle: `Reporte de Trazabilidad: ${formatDateCL(startDate)} al ${formatDateCL(endDate)}`,
            sheetName: 'Movimientos',
            creator: session.userName,
            columns: [
                { header: 'Fecha y Hora (CL)', key: 'date', width: 22 },
                { header: 'Operación', key: 'type', width: 18 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Descripción Producto', key: 'product', width: 35 },
                { header: 'Cantidad', key: 'qty', width: 12 },
                { header: 'Stock Final', key: 'stock', width: 12 },
                { header: 'Responsable', key: 'user', width: 30 },
                { header: 'Sucursal/Bodega', key: 'location', width: 20 },
                { header: 'Observaciones', key: 'notes', width: 40 },
            ],
            data,
        });

        await auditExport(session.userId, 'STOCK_MOVEMENTS', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Kardex_Global_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Stock movements error');
        return { success: false, error: 'Error exportando movimientos' };
    }
}

// ============================================================================
// EXPORT INVENTORY VALUATION
// ============================================================================

/**
 * 💰 Exportar Valorización de Inventario (ADMIN)
 */
export async function exportInventoryValuationSecure(
    warehouseId?: string
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ADMIN_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const params: any[] = [];
        let warehouseFilter = '';
        if (warehouseId) {
            warehouseFilter = 'AND ib.warehouse_id = $1';
            params.push(warehouseId);
        }

        const res = await query(`
            SELECT 
                p.sku, p.name, ib.lot_number, ib.expiry_date,
                ib.quantity_real as stock, ib.unit_cost, ib.sale_price,
                l.name as location_name
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            LEFT JOIN locations l ON ib.location_id = l.id
            WHERE ib.quantity_real > 0 ${warehouseFilter}
            ORDER BY l.name, p.name
        `, params);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || 'General',
            sku: row.sku,
            product: row.name,
            lot: row.lot_number || '-',
            expiry: row.expiry_date ? formatDateCL(row.expiry_date) : '-',
            stock: Number(row.stock),
            cost: Number(row.unit_cost || 0),
            price: Number(row.sale_price || 0),
            total_cost: Number(row.stock) * Number(row.unit_cost || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Informe de Valorización de Activos - Farmacias Vallenar',
            subtitle: `Cierre a la Fecha: ${formatDateCL(new Date())}`,
            sheetName: 'Valorización',
            creator: session.userName,
            columns: [
                { header: 'Ubicación', key: 'location', width: 22 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Descripción del Producto', key: 'product', width: 40 },
                { header: 'Lote', key: 'lot', width: 15 },
                { header: 'Vence', key: 'expiry', width: 12 },
                { header: 'Stock Actual', key: 'stock', width: 12 },
                { header: 'Costo Unit. ($)', key: 'cost', width: 15 },
                { header: 'Precio Vta. ($)', key: 'price', width: 15 },
                { header: 'Subtotal Costo ($)', key: 'total_cost', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'INVENTORY_VALUATION', { warehouseId, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Valorizacion_${new Date().toISOString().split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Valuation error');
        return { success: false, error: 'Error exportando valorización' };
    }
}

// ============================================================================
// EXPORT KARDEX BY PRODUCT
// ============================================================================

/**
 * 📊 Exportar Kardex por Producto (MANAGER+)
 */
export async function exportKardexSecure(
    sku: string,
    params: z.infer<typeof ExportParamsSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    const validated = ExportParamsSchema.safeParse(params);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    try {
        const { startDate, endDate, limit } = validated.data;
        let locationId = params.locationId;
        if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
            locationId = session.locationId;
        }

        const sqlParams: any[] = [sku, startDate, endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND sm.location_id = $4::uuid';
            sqlParams.push(locationId);
        }

        const res = await query(`
            SELECT 
                sm.timestamp, sm.movement_type, sm.quantity, sm.stock_after, sm.notes, 
                u.name as user_name, u.rut as user_rut,
                p.name as product_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id = u.id
            LEFT JOIN products p ON sm.sku = p.sku
            WHERE sm.sku = $1
              AND sm.timestamp >= $2::timestamp AND sm.timestamp <= $3::timestamp
              ${locationFilter}
            ORDER BY sm.timestamp DESC
            LIMIT $${sqlParams.length + 1}
        `, [...sqlParams, limit]);

        const productName = res.rows[0]?.product_name || sku;

        const data = res.rows.map((row: any) => ({
            date: formatDateTimeCL(row.timestamp),
            type: row.movement_type,
            qty: Number(row.quantity),
            stock: Number(row.stock_after),
            user: row.user_name ? `${row.user_name} (${row.user_rut || '-'})` : 'Sistema',
            notes: row.notes || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: `Kardex de Existencias: ${productName} - Farmacias Vallenar`,
            subtitle: `SKU: ${sku} | Período: ${formatDateCL(startDate)} - ${formatDateCL(endDate)}`,
            sheetName: 'Kardex Producto',
            creator: session.userName,
            columns: [
                { header: 'Fecha/Hora (CL)', key: 'date', width: 22 },
                { header: 'Operación', key: 'type', width: 20 },
                { header: 'Cant.', key: 'qty', width: 12 },
                { header: 'Stock Final', key: 'stock', width: 12 },
                { header: 'Responsable', key: 'user', width: 30 },
                { header: 'Referencia / Notas', key: 'notes', width: 40 },
            ],
            data,
        });

        await auditExport(session.userId, 'KARDEX', { sku, ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Kardex_${sku}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Kardex error');
        return { success: false, error: 'Error exportando kardex de producto' };
    }
}

// ============================================================================
// EXPORT INVENTORY REPORT (SNAPSHOT)
// ============================================================================

/**
 * 📊 Exportar Snapshot de Inventario (MANAGER+)
 */
export async function exportInventoryReportSecure(
    params: z.infer<typeof InventoryReportSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    const validated = InventoryReportSchema.safeParse(params);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const { warehouseId } = validated.data;
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        const sqlParams: any[] = [];
        let whereClause = 'WHERE ib.quantity_real > 0';

        if (locationId && locationId !== 'ALL') {
            whereClause += ` AND l.id = $${sqlParams.length + 1}`;
            sqlParams.push(locationId);
        }

        if (warehouseId && warehouseId !== 'ALL') {
            whereClause += ` AND w.id = $${sqlParams.length + 1}`;
            sqlParams.push(warehouseId);
        }

        const res = await query(`
            SELECT 
                p.sku, p.name as product_name, p.category,
                ib.lot_number, ib.expiry_date, ib.quantity_real as stock,
                ib.unit_cost, ib.sale_price,
                w.name as warehouse_name, l.name as location_name
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            JOIN warehouses w ON ib.warehouse_id = w.id
            JOIN locations l ON w.location_id = l.id
            ${whereClause}
            ORDER BY l.name, w.name, p.name ASC
        `, sqlParams);

        const data = res.rows.map((row: any) => ({
            location: row.location_name,
            warehouse: row.warehouse_name,
            sku: row.sku,
            product: row.product_name,
            category: row.category || '-',
            lot: row.lot_number || '-',
            expiry: row.expiry_date ? formatDateCL(row.expiry_date) : '-',
            stock: Number(row.stock),
            cost: Number(row.unit_cost || 0),
            price: Number(row.sale_price || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Existencias Actuales - Farmacias Vallenar',
            subtitle: `Estado al: ${formatDateTimeCL(new Date())} | Sucursal: ${locationId || 'Consolidado'}`,
            sheetName: 'Inventario',
            creator: session.userName,
            columns: [
                { header: 'Sucursal', key: 'location', width: 22 },
                { header: 'Bodega/Área', key: 'warehouse', width: 22 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Descripción Producto', key: 'product', width: 35 },
                { header: 'Categoría', key: 'category', width: 15 },
                { header: 'Lote', key: 'lot', width: 15 },
                { header: 'Fecha Vencimiento', key: 'expiry', width: 15 },
                { header: 'Stock Fis.', key: 'stock', width: 12 },
                { header: 'Costo Unit. ($)', key: 'cost', width: 15 },
                { header: 'Precio Vta. ($)', key: 'price', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'INVENTORY_SNAPSHOT', { ...params, rows: res.rowCount });
        return { success: true, data: buffer.toString('base64'), filename: `Inventario_${new Date().toISOString().split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Inventory report error');
        return { success: false, error: 'Error exportando inventario' };
    }
}

/**
 * 📝 Exportar Historial de Órdenes de Compra (MANAGER+)
 */
export async function exportPurchaseOrdersSecure(
    params: z.infer<typeof ExportParamsSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const { startDate, endDate, limit } = ExportParamsSchema.parse(params);

        const res = await query(`
            SELECT 
                po.id,
                po.created_at,
                po.status,
                s.business_name as supplier_name,
                po.total_amount as total,
                u.name as creator_name,
                l.name as location_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.created_by::text = u.id::text
            LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
            LEFT JOIN locations l ON w.location_id::text = l.id::text
            WHERE po.created_at >= $1::timestamp AND po.created_at <= $2::timestamp
            ORDER BY po.created_at DESC
            LIMIT $3
        `, [startDate, endDate, limit]);

        const data = res.rows.map((row: any) => ({
            id: row.id.slice(0, 8),
            date: formatDateTimeCL(row.created_at),
            supplier: row.supplier_name || 'N/A',
            status: row.status,
            total: Number(row.total || 0),
            creator: row.creator_name || 'Sistema',
            location: row.location_name || 'General'
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Historial de Órdenes de Compra - Farmacias Vallenar',
            subtitle: `Rango: ${formatDateCL(startDate)} - ${formatDateCL(endDate)}`,
            sheetName: 'Ordenes de Compra',
            creator: session.userName,
            columns: [
                { header: 'ID OC', key: 'id', width: 12 },
                { header: 'Fecha Emisión', key: 'date', width: 22 },
                { header: 'Proveedor', key: 'supplier', width: 35 },
                { header: 'Estado', key: 'status', width: 15 },
                { header: 'Monto Estimado ($)', key: 'total', width: 20 },
                { header: 'Creado Por', key: 'creator', width: 20 },
                { header: 'Sucursal', key: 'location', width: 20 },
            ],
            data,
        });

        await auditExport(session.userId, 'PO_EXPORT', { ...params, rows: res.rowCount });
        logger.info({ userId: session.userId }, '📝 [Export] Purchase orders exported');

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `OrdenesCompra_${new Date().toISOString().split('T')[0]}.xlsx`
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] PO export error');
        return { success: false, error: 'Error exportando órdenes de compra: ' + error.message };
    }
}
