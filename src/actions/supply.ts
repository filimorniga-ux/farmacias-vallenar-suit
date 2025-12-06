'use server';

import { query, pool } from '@/lib/db';
import { PurchaseOrder, StockMovementType } from '@/domain/types';

interface CreatePOParams {
    supplierId: string;
    targetWarehouseId: string;
    items: {
        sku: string;
        name: string;
        quantity: number;
        cost: number;
        suggested?: number;
    }[];
    notes?: string;
    userId: string;
    isAuto?: boolean;
    reason?: string;
}

interface ReceivePOParams {
    purchaseOrderId: string;
    userId: string;
    // Optional: Detailed reception data. If omitted, assumes full receipt with default Lot/Expiry
    receivedItems?: {
        sku: string;
        quantity: number;
        lotNumber?: string;
        expiryDate?: number;
    }[];
}

export async function createPurchaseOrder(params: CreatePOParams) {
    const { supplierId, targetWarehouseId, items, notes, userId, isAuto, reason } = params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify Warehouse
        const whRes = await client.query('SELECT location_id FROM warehouses WHERE id = $1', [targetWarehouseId]);
        if (whRes.rowCount === 0) throw new Error('Target Warehouse not found');
        const locationId = whRes.rows[0].location_id;

        // Create PO Header
        const poRes = await client.query(`
            INSERT INTO purchase_orders (
                supplier_id, target_warehouse_id, destination_location_id, 
                created_at, status, is_auto_generated, generation_reason, notes, total_estimated
            ) VALUES ($1, $2, $3, NOW(), 'DRAFT', $4, $5, $6, 0)
            RETURNING id
        `, [supplierId, targetWarehouseId, locationId, !!isAuto, reason, notes]);

        const poId = poRes.rows[0].id;
        let totalEst = 0;

        // Insert Items
        for (const item of items) {
            await client.query(`
                INSERT INTO purchase_order_items (
                    purchase_order_id, sku, name, quantity_ordered, cost_price, suggested_quantity
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [poId, item.sku, item.name, item.quantity, item.cost, item.suggested]);

            totalEst += (item.quantity * item.cost);
        }

        // Update Total
        await client.query('UPDATE purchase_orders SET total_estimated = $1 WHERE id = $2', [totalEst, poId]);

        await client.query('COMMIT');
        return { success: true, orderId: poId };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Create PO Failed', e);
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function receivePurchaseOrder(params: ReceivePOParams) {
    const { purchaseOrderId, userId, receivedItems } = params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch PO
        const poRes = await client.query(`
            SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE
        `, [purchaseOrderId]);

        if (poRes.rowCount === 0) throw new Error('PO not found');
        const po = poRes.rows[0];

        if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
            throw new Error(`PO is already ${po.status}`);
        }

        // 2. Fetch Items
        const itemsRes = await client.query(`SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`, [purchaseOrderId]);
        const originalItems = itemsRes.rows;

        // 3. Process Reception
        const whId = po.target_warehouse_id;
        if (!whId) throw new Error('PO has no Target Warehouse defined');

        // Resolve Location ID for logging
        const whDetail = await client.query('SELECT location_id FROM warehouses WHERE id = $1', [whId]);
        const locationId = whDetail.rows[0]?.location_id;

        // Effective Items to Process
        // If receivedItems provided, use them. Else use originalItems (Full Receipt)
        const itemsToReceive = receivedItems && receivedItems.length > 0 ? receivedItems : originalItems.map((i: any) => ({
            sku: i.sku,
            quantity: i.quantity_ordered,
            lotNumber: `PO-${po.id.slice(0, 8)}`,
            expiryDate: Date.now() + (365 * 24 * 60 * 60 * 1000) // Default 1 year
        }));

        for (const item of itemsToReceive) {
            // Find Product ID by SKU
            const prodRes = await client.query(`SELECT id, name, sale_price, cost_price FROM products WHERE sku = $1`, [item.sku]);
            if (prodRes.rowCount === 0) throw new Error(`Product SKU ${item.sku} not found regarding PO Item`);
            const product = prodRes.rows[0];

            // Create/Update Batch
            // Check if batch exists with same specific Lot
            // If manual reception provided details, use them.
            const lot = item.lotNumber || `PO-${po.id.slice(0, 8)}`;
            const expiry = item.expiryDate || (Date.now() + 31536000000);

            const batchRes = await client.query(`
                SELECT id, quantity_real FROM inventory_batches 
                WHERE warehouse_id = $1 AND product_id = $2 AND lot_number = $3
             `, [whId, product.id, lot]);

            let batchId;
            let stockBefore = 0;
            let stockAfter = item.quantity;

            if ((batchRes.rowCount || 0) > 0) {
                batchId = batchRes.rows[0].id;
                stockBefore = batchRes.rows[0].quantity_real;
                stockAfter = stockBefore + item.quantity;
                await client.query(`UPDATE inventory_batches SET quantity_real = $1 WHERE id = $2`, [stockAfter, batchId]);
            } else {
                const insertRes = await client.query(`
                    INSERT INTO inventory_batches (
                        product_id, warehouse_id, lot_number, expiry_date, quantity_real, 
                        sku, name, unit_cost, sale_price, location_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                 `, [
                    product.id, whId, lot, expiry, item.quantity,
                    item.sku, product.name, product.cost_price || 0, product.sale_price || 0, locationId
                ]);
                batchId = insertRes.rows[0].id;
            }

            // Log Movement (PURCHASE_ENTRY)
            await client.query(`
                INSERT INTO stock_movements (
                    sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, 
                    timestamp, user_id, notes, batch_id, reference_type, reference_id
                ) VALUES ($1, $2, $3, 'RECEIPT', $4, $5, $6, NOW(), $7, $8, $9, 'PURCHASE_ORDER', $10)
             `, [
                item.sku, product.name, locationId, item.quantity, stockBefore, stockAfter,
                userId, `Receipt PO #${po.id}`, batchId, purchaseOrderId
            ]);

            // Update Received Qty in PO Item
            await client.query(`
                UPDATE purchase_order_items SET quantity_received = quantity_received + $1 
                WHERE purchase_order_id = $2 AND sku = $3
             `, [item.quantity, purchaseOrderId, item.sku]);
        }

        // 4. Update Header Status
        // If partials were supported we'd check sums. For now, assume COMPLETED if single call.
        await client.query(`
            UPDATE purchase_orders SET status = 'RECEIVED', received_at = NOW() WHERE id = $1
        `, [purchaseOrderId]);

        await client.query('COMMIT');
        return { success: true };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Receive PO Failed', e);
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}
