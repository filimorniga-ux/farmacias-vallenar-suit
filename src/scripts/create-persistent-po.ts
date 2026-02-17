
import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

async function main() {
    console.log('🚀 Creating Persistent Purchase Order');
    const dbUrl = process.env.DATABASE_URL;

    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    const client = await pool.connect();

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
        const userId = userRes.rows.length > 0 ? userRes.rows[0].id : randomUUID(); // Ideally use a real user
        console.log(`✅ User ID: ${userId}`);

        // 2. Create Purchase Order
        console.log('\n📝 Creating Purchase Order...');
        const poId = randomUUID();

        await client.query('BEGIN');

        // INSERT PO
        await client.query(`
            INSERT INTO purchase_orders (
                id, supplier_id, target_warehouse_id,
                created_at, status, notes
            ) VALUES ($1, $2, $3, NOW(), $4, $5)
        `, [poId, null, warehouse.id, 'APPROVED', 'Orden Persistente de Prueba (Manual)']);

        // INSERT ITEM
        await client.query(`
            INSERT INTO purchase_order_items (
                id, purchase_order_id, sku, name, quantity_ordered, cost_price
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [randomUUID(), poId, product.sku, product.name, 10, Number(product.cost_price || 100)]);

        // INSERT AUDIT LOG
        // We know this works now
        await client.query(`
             INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
             VALUES ($1, 'PO_CREATED', 'PURCHASE_ORDER', $2, $3::jsonb, NOW())
        `, [userId, poId, JSON.stringify({ notes: 'Persistente' })]);

        await client.query('COMMIT');

        console.log(`\n✅ PO Created Successfully!`);
        console.log(`🆔 ID: ${poId}`);
        console.log(`📦 Status: APPROVED`);
        console.log(`🏪 Warehouse: ${warehouse.id}`);
        console.log(`\n⚠️ This order was NOT deleted. You can see it in the database/UI.`);

    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('\n❌ Failed:', error.message || error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
