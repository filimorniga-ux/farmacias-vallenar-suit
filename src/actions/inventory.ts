'use server';

import { query } from '@/lib/db';
import { InventoryBatch, StockMovementType } from '@/domain/types';
import { revalidatePath } from 'next/cache';

export async function createBatch(batchData: Partial<InventoryBatch> & { userId: string }) {
    console.log('📦 [Server Action] Creating New Batch', batchData);

    try {
        // 1. Validation
        if (!batchData.sku || !batchData.location_id) {
            return { success: false, error: 'SKU and Location are required' };
        }

        // 2. Resolve Warehouse ID
        // If location_id is a Store, it might have a default_warehouse_id.
        // We should put the stock there.
        let targetWarehouseId = batchData.warehouse_id || batchData.location_id!; // Default to location if not mapped

        // Helper check
        if (!batchData.warehouse_id) {
            try {
                const locRes = await query('SELECT default_warehouse_id FROM locations WHERE id = $1', [batchData.location_id]);
                if (locRes.rows.length > 0 && locRes.rows[0].default_warehouse_id) {
                    targetWarehouseId = locRes.rows[0].default_warehouse_id;
                    console.log(`📍 Resolved Warehouse for Batch: ${targetWarehouseId} (from Store ${batchData.location_id})`);
                }
            } catch (e) {
                console.warn('Could not resolve default warehouse, using location_id as warehouse_id', e);
            }
        }

        // 3. Insert Batch
        // We use COALESCE/DEFAULT for optional fields
        // ... (Update SQL to use targetWarehouseId)
        const insertRes = await query(`
            INSERT INTO inventory_batches (
                id, product_id, sku, name, 
                location_id, warehouse_id, aisle, 
                quantity_real, expiry_date, lot_number,
                unit_cost, sale_price,
                stock_min, stock_max
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, 
                $4, $5, $6, 
                $7, $8, $9,
                $10, $11,
                $12, $13
            )
            RETURNING id
        `, [
            batchData.id, // product_id (master linkage)
            batchData.sku,
            batchData.name,
            batchData.location_id, // location (Store)
            targetWarehouseId, // warehouse resolved
            batchData.aisle || '',
            batchData.stock_actual || 0,
            batchData.expiry_date,
            `LOT-${Date.now()}`, // Auto-generate if empty?
            batchData.cost_net || 0,
            batchData.price || 0,
            batchData.stock_min || 0,
            batchData.stock_max || 1000
        ]);

        const newBatchId = insertRes.rows[0].id;

        // 4. Log Initial Stock Movement
        await query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, 'ADJUSTMENT', 
                $4, 0, $4, 
                NOW(), $5, 'Initial Batch Creation', $6, 'INITIAL'
            )
        `, [
            batchData.sku,
            batchData.name,
            targetWarehouseId, // Log movement at WAREHOUSE level? Or Store? Usually Warehouse where valid stock exists.
            batchData.stock_actual || 0,
            batchData.userId,
            newBatchId
        ]);

        revalidatePath('/inventory');
        return { success: true, batchId: newBatchId };

    } catch (error: any) {
        console.error('❌ Failed to create batch:', error);

        // Auto-fix schema if missing columns
        if (error.code === '42703') { // Undefined column
            // Try to add stock_min if missing
            await query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS stock_min INTEGER DEFAULT 0;`);
            await query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS stock_max INTEGER DEFAULT 0;`);
            // Retry mechanism could be added here
            return { success: false, error: 'Database schema updated. Please try again.' };
        }

        return { success: false, error: error.message };
    }
}

/**
 * 📦 Get Recent Stock Movements
 * Replaces MOCK_DATA in WarehouseOps
 */
export async function getRecentMovements(locationId?: string, limit = 100) {
    try {
        let whereClause = "";
        const params: any[] = [];

        if (locationId) {
            whereClause = "WHERE sm.location_id::text = $1 OR sm.location_id::text = (SELECT default_warehouse_id::text FROM locations WHERE id::text = $1)";
            params.push(locationId);
        }

        const sql = `
            SELECT 
                sm.id::text as id,
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
            LIMIT ${limit}
        `;

        const res = await query(sql, params);

        return res.rows.map(row => ({
            id: row.id,
            date: row.timestamp,
            type: row.movement_type,
            product: row.product_name, // sm.product_name is usually denormalized
            sku: row.sku,
            quantity: Number(row.quantity),
            user: row.user_name || 'Sistema',
            location: row.location_name,
            notes: row.notes
        }));

    } catch (error) {
        console.error('Error fetching recent movements:', error);
        return [];
    }
}

/**
 * 🔍 Get Inventory (Strict Isolation)
 * Retorna el inventario filtrado estrictamente por Location ID.
 */
export async function getInventory(locationId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        if (!locationId) return { success: false, error: 'Location ID is required' };

        console.log(`📦 [Server Action] Fetching Inventory for Location: ${locationId}`);

        // La consulta une inventory_batches con products para tener la info completa
        // FILTRO ESTRICTO: WHERE ib.location_id = $1
        const sql = `
            SELECT 
                p.id as product_id,
                p.sku,
                p.name,
                p.dci,
                p.category,
                p.units_per_box,
                p.price_sell_box, 
                p.format,
                
                ib.id as batch_id,
                ib.location_id,     -- ESTA ES LA CLAVE DE LA AISLACIÓN
                ib.warehouse_id,
                ib.lot_number,
                ib.expiry_date as batch_expiry,
                ib.quantity_real as stock_actual,
                ib.unit_cost,
                ib.sale_price as batch_price,
                ib.stock_min,
                ib.stock_max

            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
            WHERE ib.location_id::text = $1
            ORDER BY p.name ASC
        `;

        const res = await query(sql, [locationId]);

        // Mapeo a un formato amigable para el frontend (InventoryBatch)
        const inventory = res.rows.map(row => ({
            id: row.batch_id, // Usamos el ID del lote como ID único en la tabla
            sku: row.sku,
            name: row.name,
            dci: row.dci,
            category: row.category || 'MEDICAMENTO',

            // Stock y Ubicación
            location_id: row.location_id,
            warehouse_id: row.warehouse_id,
            stock_actual: Number(row.stock_actual) || 0,
            stock_min: Number(row.stock_min) || 5,

            // Precios y Costos
            price: Number(row.batch_price) || Number(row.price_sell_box) || 0,
            cost_price: Number(row.unit_cost) || 0,

            // Lote
            expiry_date: (row.batch_expiry) ? new Date(row.batch_expiry).getTime() : Date.now(),
            lot_number: row.lot_number,

            // Metadata
            format: row.format,
            units_per_box: row.units_per_box,
            is_generic: false // TODO: Traer de DB
        }));

        console.log(`✅ Found ${inventory.length} items for ${locationId}`);
        return { success: true, data: inventory };

    } catch (error: any) {
        console.error('❌ Error fetching inventory:', error);
        return { success: false, error: error.message };
    }
}


/**
 * ☢️ NUCLEAR DELETE: Clear Location Inventory
 * Elimina TODO el stock de una sucursal específica.
 * Requiere validación de seguridad extra.
 */
export async function clearLocationInventory(locationId: string, userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    console.log(`☢️ [NUCLEAR] Attempting to clear inventory for location: ${locationId} by user ${userId}`);

    try {
        // 1. Security Check: Verify User Role
        const userRes = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
        if (userRes.rows.length === 0) return { success: false, error: 'User not found' };

        const role = userRes.rows[0].role;
        if (role !== 'ADMIN' && role !== 'MANAGER') {
            return { success: false, error: 'Unauthorized: Only ADMIN or MANAGER can perform this action.' };
        }

        // 2. The Purge
        // Filter STRICTLY by location_id
        const result = await query(`
            DELETE FROM inventory_batches 
            WHERE location_id = $1
        `, [locationId]);

        console.log(`💥 [NUCLEAR] Deleted ${result.rowCount} items from ${locationId}`);

        // 3. Revalidate
        revalidatePath('/inventory');

        return {
            success: true,
            message: `Se eliminaron ${result.rowCount} registros de inventario en la sucursal.`
        };

    } catch (error: any) {
        console.error('❌ Nuclear Delete Failed:', error);
        return { success: false, error: error.message };
    }
}
