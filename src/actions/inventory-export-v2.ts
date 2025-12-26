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
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

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

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string; userName?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const userName = headersList.get('x-user-name');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, userName: userName || undefined };
    } catch {
        return null;
    }
}

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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar inventario' };
    }

    const validated = ExportParamsSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { startDate, endDate, limit } = validated.data;

    // Forzar ubicación para no-admin
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

        const sql = `
            SELECT 
                sm.timestamp, sm.movement_type, sm.quantity, sm.stock_after,
                sm.notes, sm.product_name, sm.sku, u.name as user_name, l.name as location_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id::text = u.id::text
            LEFT JOIN locations l ON sm.location_id::text = l.id::text
            ${whereClause}
            ORDER BY sm.timestamp DESC
            LIMIT $${sqlParams.length + 1}
        `;
        sqlParams.push(limit);

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: new Date(row.timestamp).toLocaleDateString('es-CL'),
            time: new Date(row.timestamp).toLocaleTimeString('es-CL'),
            type: row.movement_type,
            sku: row.sku,
            product: row.product_name,
            qty: Number(row.quantity),
            stock: Number(row.stock_after),
            user: row.user_name || 'Sistema',
            notes: row.notes || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Kardex de Movimientos de Inventario',
            subtitle: `Período: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Movimientos',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Tipo', key: 'type', width: 20 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'Cantidad', key: 'qty', width: 10 },
                { header: 'Saldo', key: 'stock', width: 10 },
                { header: 'Usuario', key: 'user', width: 20 },
                { header: 'Notas', key: 'notes', width: 30 },
            ],
            data,
        });

        // Auditar
        await auditExport(session.userId, 'STOCK_MOVEMENTS', { startDate, endDate, locationId, rows: res.rowCount });

        logger.info({ userId: session.userId, rows: res.rowCount }, '📦 [Export] Stock movements exported');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Kardex_${startDate.split('T')[0]}.xlsx`,
        };

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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden exportar valorización' };
    }

    try {
        const params: any[] = [];
        let warehouseFilter = '';
        if (warehouseId) {
            warehouseFilter = 'AND ib.warehouse_id::text = $1';
            params.push(warehouseId);
        }

        const sql = `
            SELECT 
                p.sku, p.name, ib.lot_number, ib.expiry_date,
                ib.quantity_real as stock, ib.unit_cost, ib.sale_price,
                l.name as location_name
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            LEFT JOIN locations l ON ib.location_id = l.id
            WHERE ib.quantity_real > 0 ${warehouseFilter}
            ORDER BY l.name, p.name
        `;

        const res = await query(sql, params);

        const data = res.rows.map((row: any) => ({
            location: row.location_name || 'General',
            sku: row.sku,
            product: row.name,
            lot: row.lot_number || '-',
            expiry: row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('es-CL') : '-',
            stock: Number(row.stock),
            cost: Number(row.unit_cost || 0),
            price: Number(row.sale_price || 0),
            total_cost: Number(row.stock) * Number(row.unit_cost || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Valorización de Inventario',
            subtitle: `Generado: ${new Date().toLocaleDateString('es-CL')}`,
            sheetName: 'Inventario',
            creator: session.userName,
            columns: [
                { header: 'Ubicación', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'Lote', key: 'lot', width: 15 },
                { header: 'Vencimiento', key: 'expiry', width: 12 },
                { header: 'Stock', key: 'stock', width: 10 },
                { header: 'Costo Unt', key: 'cost', width: 12 },
                { header: 'Precio Vta', key: 'price', width: 12 },
                { header: 'Total Costo', key: 'total_cost', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'INVENTORY_VALUATION', { warehouseId, rows: res.rowCount });

        logger.info({ userId: session.userId, rows: res.rowCount }, '💰 [Export] Valuation exported');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Valorizacion_${new Date().toISOString().split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Valuation error');
        return { success: false, error: 'Error exportando valorización' };
    }
}

// ============================================================================
// EXPORT KARDEX
// ============================================================================

/**
 * 📊 Exportar Kardex por Producto (MANAGER+)
 */
export async function exportKardexSecure(
    sku: string,
    params: z.infer<typeof ExportParamsSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    const validated = ExportParamsSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

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

        const sql = `
            SELECT sm.timestamp, sm.movement_type, sm.quantity, sm.stock_after, sm.notes, u.name as user_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id::text = u.id::text
            WHERE sm.sku = $1
              AND sm.timestamp >= $2::timestamp AND sm.timestamp <= $3::timestamp
              ${locationFilter}
            ORDER BY sm.timestamp DESC
            LIMIT ${limit}
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map((row: any) => ({
            date: new Date(row.timestamp).toLocaleString('es-CL'),
            type: row.movement_type,
            qty: Number(row.quantity),
            stock: Number(row.stock_after),
            user: row.user_name || 'Sistema',
            notes: row.notes || '-',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: `Kardex: ${sku}`,
            subtitle: `Período: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Kardex',
            creator: session.userName,
            columns: [
                { header: 'Fecha/Hora', key: 'date', width: 20 },
                { header: 'Tipo', key: 'type', width: 20 },
                { header: 'Cantidad', key: 'qty', width: 12 },
                { header: 'Saldo', key: 'stock', width: 12 },
                { header: 'Usuario', key: 'user', width: 20 },
                { header: 'Notas', key: 'notes', width: 30 },
            ],
            data,
        });

        await auditExport(session.userId, 'KARDEX', { sku, startDate, endDate, rows: res.rowCount });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Kardex_${sku}_${startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Kardex error');
        return { success: false, error: 'Error exportando kardex' };
    }
}
