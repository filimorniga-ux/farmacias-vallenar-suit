'use server';

import { query } from '@/lib/db';
import ExcelJS from 'exceljs';
import { ExcelService } from '@/lib/excel-generator';

interface ExportStockParams {
    startDate: string; // ISO
    endDate: string; // ISO
    locationId?: string;
    locationName?: string;
    creatorName?: string;
}

export async function exportStockMovements(params: ExportStockParams) {
    try {
        const { startDate, endDate, locationId, locationName, creatorName } = params;
        const excel = new ExcelService();

        console.log(`📦 [Export] Generando Reporte de Movimientos: ${startDate} - ${endDate} (${locationId || 'ALL'})`);

        // SQL Query
        let whereClause = "WHERE sm.timestamp >= $1::timestamp AND sm.timestamp <= $2::timestamp";
        const sqlParams: any[] = [startDate, endDate];

        if (locationId) {
            whereClause += " AND (sm.location_id::text = $3 OR sm.location_id::text = (SELECT default_warehouse_id::text FROM locations WHERE id::text = $3))";
            sqlParams.push(locationId);
        }

        const sql = `
            SELECT 
                sm.timestamp,
                sm.movement_type,
                sm.quantity,
                sm.stock_after,
                sm.notes,
                sm.product_name,
                sm.sku,
                u.name as user_name,
                l.name as location_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id::text = u.id::text
            LEFT JOIN locations l ON sm.location_id::text = l.id::text
            ${whereClause}
            ORDER BY sm.timestamp DESC
            LIMIT 5000
        `;

        const res = await query(sql, sqlParams);

        const data = res.rows.map(row => ({
            date: new Date(row.timestamp).toLocaleDateString('es-CL'),
            time: new Date(row.timestamp).toLocaleTimeString('es-CL'),
            type: row.movement_type,
            sku: row.sku,
            product: row.product_name,
            qty: Number(row.quantity),
            stock: Number(row.stock_after),
            user: row.user_name || 'Sistema',
            notes: row.notes || '-'
        }));

        const buffer = await excel.generateReport({
            title: 'Kardex de Movimientos de Inventario',
            subtitle: `Bodega: ${locationName || 'General'} | Período: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Movimientos',
            creator: creatorName,
            locationName: locationName,
            columns: [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Tipo', key: 'type', width: 20 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Producto', key: 'product', width: 40 },
                { header: 'Cantidad', key: 'qty', width: 10 },
                { header: 'Saldo', key: 'stock', width: 10 },
                { header: 'Usuario', key: 'user', width: 20 },
                { header: 'Notas / Ref', key: 'notes', width: 30 }
            ],
            data: data
        });

        const base64 = buffer.toString('base64');
        return { success: true, data: base64, filename: `Kardex_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        console.error('Error exporting stock movements:', error);
        return { success: false, error: error.message };
    }
}

export async function exportPurchaseOrders(params: ExportStockParams) {
    try {
        const { startDate, endDate, locationId, locationName, creatorName } = params;
        const excel = new ExcelService();

        console.log(`🛒 [Export] Generando Reporte de Compras: ${startDate} - ${endDate}`);

        // SQL Query
        // Note: Purchase Orders are usually filtered by creation date
        const sql = `
            SELECT 
                po.id,
                po.supplier_id,
                po.status,
                po.total_estimated,
                po.created_at,
                po.destination_location_id,
                l.name as location_name
            FROM purchase_orders po
            LEFT JOIN locations l ON po.destination_location_id::text = l.id::text
            WHERE po.created_at >= $1::timestamp AND po.created_at <= $2::timestamp
            ORDER BY po.created_at DESC
        `;

        const res = await query(sql, [startDate, endDate]);

        const data = res.rows.map(row => ({
            id: row.id,
            date: new Date(row.created_at).toLocaleDateString('es-CL'),
            supplier: row.supplier_id, // Usually ID, maybe name if join
            status: row.status,
            total: Number(row.total_estimated),
            destination: row.location_name || row.destination_location_id
        }));

        const buffer = await excel.generateReport({
            title: 'Reporte de Pedidos a Proveedor',
            subtitle: `Período: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Pedidos',
            creator: creatorName,
            locationName: locationName,
            columns: [
                { header: 'ID Pedido', key: 'id', width: 20 },
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Proveedor', key: 'supplier', width: 25 },
                { header: 'Estado', key: 'status', width: 15 },
                { header: 'Destino', key: 'destination', width: 20 },
                { header: 'Monto Estimado', key: 'total', width: 15, style: { numFmt: '"$"#,##0' } }
            ],
            data: data
        });

        const base64 = buffer.toString('base64');
        return { success: true, data: base64, filename: `Pedidos_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        console.error('Error exporting purchase orders:', error);
        return { success: false, error: error.message };
    }
}


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
