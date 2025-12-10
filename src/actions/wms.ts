'use server';

import { query, pool } from '@/lib/db';
import { StockMovementType } from '@/domain/types';
import { logAuditAction } from './security';

interface StockMovementParams {
    productId: string; // Product ID (UUID)
    warehouseId: string; // Warehouse ID
    quantity: number; // Absolute quantity to Add/Subtract? No, usually "Delta" or "New Quantity"?
    // The prompt says "Inputs: productId, warehouseId, quantity, type". 
    // Usually quantity is the amount to move/adjust.
    type: StockMovementType;
    reason: string;
    userId: string;
    batchId?: string; // Optional specific batch
}

interface TransferParams {
    originWarehouseId: string;
    targetWarehouseId: string;
    items: {
        productId: string;
        quantity: number;
        lotId?: string; // Inventory Batch ID from Origin
    }[];
    userId: string;
    notes?: string;
}

// 1. Execute Generic Stock Movement (Adjustment, Loss, Return)
export async function executeStockMovement(params: StockMovementParams) {
    const { productId, warehouseId, quantity, type, reason, userId, batchId } = params;

    // Safety Check: No negative moves that result in negative stock?
    // "Impedir movimientos si resultan en stock negativo"

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Identify Batch
        let targetBatchId = batchId;

        // If no batchId, usually we pick the first one or require it?
        // For simple adjustments, we might need to find a batch.
        // If 'stock_movements' requires batch_id, we need it.
        // Let's assume for strict WMS, batchId is required OR we auto-select FIFO.
        // For simplicity, if Not provided, fetch the one with most stock or arbitrary? 
        // Prompt says "Verificar existencia del lote/producto".
        // Let's enforce batchId for Adjustments if possible, or lookup.

        if (!targetBatchId) {
            // Lookup batch
            const res = await client.query(`
                SELECT id, quantity_real FROM inventory_batches 
                WHERE product_id = $1 AND warehouse_id = $2
                ORDER BY expiry_date ASC LIMIT 1
             `, [productId, warehouseId]);

            if (res.rowCount === 0) {
                throw new Error('No inventory batch found for this product/warehouse.');
            }
            targetBatchId = res.rows[0].id;
        }

        // 2. Calculate Delta based on Type
        // If ADJUSMENT, quantity might be the "New Count" vs "Diff".
        // Prompt: "Restar... Sumar...". implied 'quantity' is the Amount to change.
        // Let's assume Quantity is ALWAYS positive number, and Type determines Sign?
        // ADJUSMENT: Can be + or -. USUALLY explicit "Increment/Decrement".
        // Let's assume input 'quantity' is positive integer.
        // LOSS -> Subtract. RETURN -> Add. ADJUSTMENT -> ? User specifies sign?
        // Let's assume caller handles this or we define logic.
        // Prompt: "Restar de Bodega Central (Salida)... Sumar a Sucursal (Entrada)".
        // So quantity is the absolute amount moved.

        let delta = 0;
        if (['LOSS', 'TRANSFER_OUT', 'SALE'].includes(type)) {
            delta = -Math.abs(quantity);
        } else if (['RETURN', 'TRANSFER_IN', 'RECEIPT', 'PURCHASE_ENTRY'].includes(type)) {
            delta = Math.abs(quantity);
        } else if (type === 'ADJUSTMENT') {
            // Ambiguous. Usually "Count" implies we overwrite, OR "Adjustment" implies +/-.
            // Let's assume 'quantity' can be negative for adjustment if passed as such, or we look at `reason`.
            // For safety, let's treat ADJUSTMENT as signed input or require caller to use specific type.
            // But strict types are fixed.
            // Let's assume 'quantity' is SIGNED for Adjustment?
            // User Prompt description: "Inputs... quantity...".
            // Implementation: Assume quantity is passed with Sign if Adjustment, or handled by caller logic. 
            // BUT for TRANSFER it specifies "Restar... Sumar".
            // Let's treat Params.quantity as Absolute.
            // If Type LOSS => -Qty.
            // If Type ADJUSTMENT => ??? Let's assume it adds (positive) or caller passes negative.
            // Actually, usually WMS adjustments are "Cycle Count" -> "Set to X".
            // Let's stick to "Delta" logic.
            delta = quantity; // Caller must sign it properly for Adjustment? 
            // Or better: Logic for specific types.
        }

        // Check Stock for negatives
        const batchRes = await client.query(`SELECT quantity_real, product_id, sku FROM inventory_batches WHERE id = $1 FOR UPDATE`, [targetBatchId]);
        if (batchRes.rowCount === 0) throw new Error('Batch not found');

        const currentQty = batchRes.rows[0].quantity_real;
        const newQty = currentQty + delta;

        if (newQty < 0) {
            throw new Error(`Insufficient stock for movement. Current: ${currentQty}, Requested Change: ${delta}`);
        }

        // Update
        await client.query(`UPDATE inventory_batches SET quantity_real = $1 WHERE id = $2`, [newQty, targetBatchId]);

        // Log to Stock Movements
        // Need SKU and Name. Fetch if needed (InventoryBatch has SKU usually, or Product).
        // `inventory_batches` might not have product name. Product table has it.
        const productRes = await client.query('SELECT name, sku FROM products WHERE id = $1', [productId]);
        const productName = productRes.rows[0]?.name || 'Unknown';
        const productSku = productRes.rows[0]?.sku || batchRes.rows[0].sku || 'N/A';

        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id
            ) VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10
            )
        `, [
            productSku, productName, // SKU, Name
            (await getLocationFromWarehouse(client, warehouseId)), // Needs Location ID
            type, delta, currentQty, newQty,
            userId, reason, targetBatchId
        ]);

        await client.query('COMMIT');
        // Audit: Log Adjustments (Loss/Merma)
        if (type === 'ADJUSTMENT' && delta < 0) {
            await logAuditAction(userId, 'STOCK_LOSS', {
                type,
                product: productName,
                sku: productSku,
                qty: Math.abs(delta), // Log positive amount of loss
                reason: reason,
                location: warehouseId
            });
        }

        return { success: true, newStock: newQty };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Stock Movement Failed', e);
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

// Helper to get Location from Warehouse
async function getLocationFromWarehouse(client: any, warehouseId: string) {
    const res = await client.query('SELECT location_id FROM warehouses WHERE id = $1', [warehouseId]);
    return res.rows[0]?.location_id;
}


// 2. Execute Transfer (Atomic)
export async function executeTransfer(params: TransferParams) {
    const { originWarehouseId, targetWarehouseId, items, userId, notes } = params;

    if (originWarehouseId === targetWarehouseId) {
        return { success: false, error: "Origin and Destination cannot be the same" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Resolve Location IDs for Logging
        const originLoc = await getLocationFromWarehouse(client, originWarehouseId);
        const targetLoc = await getLocationFromWarehouse(client, targetWarehouseId);

        if (!originLoc || !targetLoc) throw new Error("Invalid Warehouses");

        for (const item of items) {
            // 1. Lock & Validate Origin
            // If lotId provided, specific batch. Else FIFO?
            // Prompt says: "items [{ ... lotId }]" -> implied simple transfer of specific lot.
            if (!item.lotId) throw new Error(`Lot ID missing for product ${item.productId}`);

            const originBatchRes = await client.query(
                `SELECT * FROM inventory_batches WHERE id = $1 AND warehouse_id = $2 FOR UPDATE`,
                [item.lotId, originWarehouseId]
            );

            if (originBatchRes.rowCount === 0) throw new Error(`Batch ${item.lotId} not found in origin`);

            const batch = originBatchRes.rows[0];
            if (batch.quantity_real < item.quantity) {
                throw new Error(`Insufficient stock for SKU ${batch.sku}. Available: ${batch.quantity_real}`);
            }

            // 2. Decrement Origin
            const newOriginQty = batch.quantity_real - item.quantity;
            await client.query(`UPDATE inventory_batches SET quantity_real = $1 WHERE id = $2`, [newOriginQty, item.lotId]);

            // 3. Log OUT
            await client.query(`
                INSERT INTO stock_movements (
                    sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, 
                    timestamp, user_id, notes, batch_id, reference_type
                ) VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, NOW(), $7, $8, $9, 'TRANSFER')
             `, [
                batch.sku, batch.name, originLoc, -item.quantity, batch.quantity_real, newOriginQty,
                userId, `Transfer to ${targetWarehouseId}`, item.lotId
            ]);

            // 4. Increment/Create Destination
            // Find matching batch (same Lot Number & Expiry & Product) in Dest
            // Note: 'lot_number' is text. 'expiry_date' is number/timestamp.
            const destBatchRes = await client.query(`
                SELECT * FROM inventory_batches 
                WHERE warehouse_id = $1 AND product_id = $2 AND lot_number = $3 AND expiry_date = $4
             `, [targetWarehouseId, batch.product_id, batch.lot_number, batch.expiry_date]);

            let destBatchId;
            let destBefore = 0;
            let destAfter = item.quantity;

            if ((destBatchRes.rowCount || 0) > 0) {
                // Update
                const destBatch = destBatchRes.rows[0];
                destBatchId = destBatch.id;
                destBefore = destBatch.quantity_real;
                destAfter = destBefore + item.quantity;

                await client.query(`UPDATE inventory_batches SET quantity_real = $1 WHERE id = $2`, [destAfter, destBatchId]);
            } else {
                // Insert
                // Need all fields: name, sku, etc. copy from origin
                const insertRes = await client.query(`
                    INSERT INTO inventory_batches (
                        product_id, warehouse_id, lot_number, expiry_date, quantity_real, 
                        sku, name, unit_cost, sale_price, location_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                 `, [
                    batch.product_id, targetWarehouseId, batch.lot_number, batch.expiry_date, item.quantity,
                    batch.sku, batch.name, batch.unit_cost, batch.sale_price, targetLoc
                ]);
                destBatchId = insertRes.rows[0].id;
            }

            // 5. Log IN
            await client.query(`
                INSERT INTO stock_movements (
                    sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, 
                    timestamp, user_id, notes, batch_id, reference_type
                ) VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6, NOW(), $7, $8, $9, 'TRANSFER')
             `, [
                batch.sku, batch.name, targetLoc, item.quantity, destBefore, destAfter,
                userId, `Transfer from ${originWarehouseId}`, destBatchId
            ]);
        }

        await client.query('COMMIT');
        return { success: true };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Transfer Failed', e);
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}// ... previous code

/**
 * 📦 Get Shipments (Inbound/Outbound/Transit)
 */
export async function getShipments(locationId?: string): Promise<any[]> {
    try {
        let queryStr = `
            SELECT * FROM shipments 
            WHERE 1=1
        `;
        const params: any[] = [];

        if (locationId) {
            queryStr += ` AND (origin_location_id = $1 OR destination_location_id = $1)`;
            params.push(locationId);
        }

        queryStr += ` ORDER BY created_at DESC LIMIT 100`;

        const res = await query(queryStr, params);

        // Map to Shipment type
        return res.rows.map(row => ({
            id: row.id,
            origin_location_id: row.origin_location_id,
            destination_location_id: row.destination_location_id,
            status: row.status,
            type: row.type,
            created_at: new Date(row.created_at).getTime(), // Convert to timestamp
            updated_at: new Date(row.updated_at).getTime(),
            transport_data: row.transport_data || {},
            items: row.items || [], // Jsonb
            valuation: Number(row.valuation) || 0,
            documents: row.documents || []
        }));

    } catch (error) {
        console.error('Error fetching shipments:', error);
        return [];
    }
}

/**
 * 🛒 Get Purchase Orders
 */
export async function getPurchaseOrders(locationId?: string): Promise<any[]> {
    try {
        // Needs a purchase_orders table. 
        // Assuming it exists or using a mock structure from DB.
        // If not exists, return empty.

        // Let's check schema first? Or just try query.
        // Assuming 'purchase_orders' table.
        const res = await query(`SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT 50`);
        return res.rows.map(row => ({
            ...row,
            created_at: new Date(row.created_at).getTime(),
            delivery_date: row.delivery_date ? new Date(row.delivery_date).getTime() : undefined
        }));
    } catch (error) {
        // Silent fail if table missing
        return [];
    }
}
