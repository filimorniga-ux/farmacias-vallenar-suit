'use server';

import { query } from '@/lib/db';
import ExcelJS from 'exceljs';

interface InventoryExportParams {
    startDate?: string; // Not used for Snapshot but kept for compatibility
    endDate?: string;
    locationId?: string; // UUID
    warehouseId?: string; // UUID
    type?: 'kardex' | 'seed';
    requestingUserRole?: string; // Security
    requestingUserLocationId?: string; // Security
}

export async function exportInventoryReport(params: InventoryExportParams) {
    const { locationId, warehouseId, type = 'seed', requestingUserRole, requestingUserLocationId } = params;

    // --- SECURITY CHECK ---
    // If not Manager/Admin, FORCE location filter to their assigned location
    let effectiveLocationId = locationId;

    // Explicit Role Check (assuming passed from frontend safe context or derived)
    // Ideally this comes from a secure session, here we rely on the argument for the pattern.
    const isManagerial = ['MANAGER', 'ADMIN', 'QF'].includes(requestingUserRole || '');

    if (!isManagerial && requestingUserLocationId) {
        effectiveLocationId = requestingUserLocationId;
        // Also ensure they can't request a warehouse outside their location?
        // Query will handle that by joining.
    }

    try {
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet('Inventario');

        // Logic for Stock Snapshot (Seed)
        // We query 'inventory_batches' + 'products' + 'warehouses' + 'locations'
        // This gives EXACT Real-Time Stock.

        let sql = `
            SELECT 
                p.sku,
                p.name as product_name,
                p.category,
                ib.lot_number,
                ib.expiry_date,
                ib.quantity_real as stock,
                ib.unit_cost,
                ib.sale_price,
                w.name as warehouse_name,
                l.name as location_name
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text 
            -- Note: Casting p.id to text because schema had mismatch, ensuring compatibility
            JOIN warehouses w ON ib.warehouse_id = w.id
            JOIN locations l ON w.location_id = l.id
            WHERE ib.quantity_real > 0
        `;

        const queryParams: any[] = [];

        if (effectiveLocationId && effectiveLocationId !== 'ALL') {
            sql += ` AND l.id = $${queryParams.length + 1}`;
            queryParams.push(effectiveLocationId);
        }

        if (warehouseId && warehouseId !== 'ALL') {
            sql += ` AND w.id = $${queryParams.length + 1}`;
            queryParams.push(warehouseId);
        }

        sql += ` ORDER BY l.name, w.name, p.name ASC`;

        const res = await query(sql, queryParams);

        // --- EXCEL FORMATTING ---
        sheet.mergeCells('A1:J1');
        sheet.getCell('A1').value = `REPORTE DE INVENTARIO (MULTI-SUCURSAL)`;
        sheet.getCell('A1').font = { bold: true, size: 14 };
        sheet.getCell('A1').alignment = { horizontal: 'center' };

        sheet.getRow(3).values = [
            'Sucursal', 'Bodega', 'SKU', 'Producto', 'Categoría', 'Lote', 'Vencimiento', 'Stock', 'Costo', 'Precio Venta'
        ];
        sheet.getRow(3).font = { bold: true };

        res.rows.forEach(r => {
            sheet.addRow([
                r.location_name,
                r.warehouse_name,
                r.sku,
                r.product_name,
                r.category,
                r.lot_number,
                new Date(r.expiry_date).toLocaleDateString(),
                Number(r.stock),
                Number(r.unit_cost),
                Number(r.sale_price)
            ]);
        });

        const buffer = await wb.xlsx.writeBuffer();

        return {
            success: true,
            data: Buffer.from(buffer).toString('base64'),
            filename: `Inventario_${new Date().toISOString().split('T')[0]}.xlsx`
        };

    } catch (error) {
        console.error('Export Error:', error);
        return { success: false, error: 'Failed to generate report' };
    }
}

// --- Helpers for Selectors ---

export async function getLocations() {
    try {
        const res = await query('SELECT id, name FROM locations WHERE is_active = true ORDER BY name');
        return res.rows;
    } catch (e) { return []; }
}

export async function getWarehouses(locationId?: string) {
    try {
        let sql = 'SELECT id, name, location_id FROM warehouses WHERE is_active = true';
        const params: any[] = [];

        if (locationId) {
            sql += ` AND location_id = $1`;
            params.push(locationId);
        }

        const res = await query(sql, params);
        return res.rows;
    } catch (e) { return []; }
}
