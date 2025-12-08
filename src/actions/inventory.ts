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
