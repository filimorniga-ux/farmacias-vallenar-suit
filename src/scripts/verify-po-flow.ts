
import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

async function main() {
    console.log('🚀 Verify Flow V2 (Final Fixed for PO Table)');
    const dbUrl = process.env.DATABASE_URL;

    // Config matches debug-pg.ts which worked
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    console.log('Connecting...');
    const client = await pool.connect();
    console.log('✅ Connected via client');

    let testOrderId: string | undefined;

    try {
        // 1. Get necessary data
        console.log('🔍 Fetching test data...');

        // Warehouse
        const whRes = await client.query('SELECT id, location_id FROM warehouses LIMIT 1');
        if (whRes.rows.length === 0) throw new Error('No warehouses found');
        const warehouse = whRes.rows[0];
        console.log(`✅ Warehouse found: ${warehouse.id}`);

        // Product
        const prodRes = await client.query('SELECT id, sku, name, cost_price FROM products LIMIT 1');
        if (prodRes.rows.length === 0) throw new Error('No products found');
        const product = prodRes.rows[0];
        console.log(`✅ Product found: ${product.sku} (${product.name})`);

        // User
        const userRes = await client.query('SELECT id FROM users LIMIT 1');
        const userId = userRes.rows.length > 0 ? userRes.rows[0].id : randomUUID();
        console.log(`✅ User ID: ${userId}`);

        // 2. Create Purchase Order (Inline Logic)
        console.log('\n📝 Creating Purchase Order...');
        const poId = randomUUID();
        testOrderId = poId;

        await client.query('BEGIN');

        // INSERT PO
        await client.query(`
            INSERT INTO purchase_orders (
                id, supplier_id, target_warehouse_id,
                created_at, status, notes
            ) VALUES ($1, $2, $3, NOW(), $4, $5)
        `, [poId, null, warehouse.id, 'APPROVED', 'Automated Test Order (Inline V2)']);

        // INSERT ITEM (The critical part: NO product_id)
        await client.query(`
            INSERT INTO purchase_order_items (
                id, purchase_order_id, sku, name, quantity_ordered, cost_price
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [randomUUID(), poId, product.sku, product.name, 10, Number(product.cost_price || 100)]);

        await client.query('COMMIT');
        console.log(`✅ PO Created: ${poId}`);

        // 3. Verify Database State (PO)
        const poCheck = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [testOrderId]);
        if (poCheck.rows.length === 0) throw new Error('PO not found in DB');
        console.log(`✅ DB Check: PO exists.`);

        // 4. Verify Database State (Items)
        const itemCheck = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [testOrderId]);
        if (itemCheck.rows.length !== 1) throw new Error('PO Item count mismatch');
        const dbItem = itemCheck.rows[0];
        console.log(`✅ DB Check: Item exists. SKU: ${dbItem.sku}`);

        // 5. Receive Purchase Order (Inline Logic)
        console.log('\n🚚 Receiving Purchase Order...');
        await client.query('BEGIN');

        // Verify lookup logic
        const prodLookup = await client.query('SELECT id FROM products WHERE sku = $1', [dbItem.sku]);
        const productId = prodLookup.rows[0]?.id;
        if (!productId) throw new Error('Product ID lookup failed');
        console.log(`✅ Product ID lookup successful: ${productId}`);

        // Update PO Item received qty - REMOVED received_at
        await client.query(`
            UPDATE purchase_order_items
            SET quantity_received = COALESCE(quantity_received, 0) + $1
            WHERE id = $2
        `, [5, dbItem.id]);

        // Inventory Batch Logic
        const lotNumber = 'TEST-LOT-V2';
        const batchRes = await client.query(`
            SELECT id FROM inventory_batches
            WHERE product_id = $1 AND warehouse_id = $2 AND lot_number = $3
        `, [productId, warehouse.id, lotNumber]);

        if (batchRes.rows.length > 0) {
            await client.query('UPDATE inventory_batches SET quantity_real = quantity_real + 5 WHERE id = $1', [batchRes.rows[0].id]);
        } else {
            await client.query(`
                INSERT INTO inventory_batches (
                    id, product_id, warehouse_id, lot_number, expiry_date,
                    quantity_real, sku, name, unit_cost, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            `, [randomUUID(), productId, warehouse.id, lotNumber, new Date(Date.now() + 100000000), 5, product.sku, product.name, Number(product.cost_price || 0)]);
        }

        // UPDATE PO Status - REMOVED received_at, receiving_notes, updated_at
        await client.query(`
            UPDATE purchase_orders
            SET status = 'RECEIVED',
                received_by = $1
            WHERE id = $2
        `, [userId, testOrderId]);

        await client.query('COMMIT');

        console.log('✅ PO Received (Partial)');

        // 6. Verify Inventory Update
        const batchCheck = await client.query('SELECT * FROM inventory_batches WHERE lot_number = $1', [lotNumber]);
        if (batchCheck.rows.length === 0) throw new Error('Inventory batch not created');
        console.log(`✅ Inventory Batch created: ${batchCheck.rows[0].id}, Quantity: ${batchCheck.rows[0].quantity_real}`);

        console.log('\n✨ Verification Successful!');

    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('\n❌ Verification Failed:', error.message || error);
    } finally {
        // Cleanup
        if (testOrderId) {
            console.log('\n🧹 Cleaning up...');
            try {
                // Manually delete since deletePurchaseOrderSecure might have checks
                await client.query('DELETE FROM stock_movements WHERE notes LIKE $1', [`%${testOrderId.slice(0, 8)}%`]);
                await client.query('DELETE FROM inventory_batches WHERE lot_number LIKE $1', ['TEST-LOT%']);
                await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [testOrderId]);
                await client.query('DELETE FROM purchase_orders WHERE id = $1', [testOrderId]);
                console.log('✅ Cleanup complete');
            } catch (cleanupErr) {
                console.error('⚠️ Cleanup failed:', cleanupErr);
            }
        }
        client.release();
        await pool.end();
        console.log('🏁 Pool Ended');
    }
}

main();
