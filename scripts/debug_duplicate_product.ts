
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('🔌 Conectado a DB');

        const sku = '50000';
        console.log(`🔍 Analizando SKU: ${sku}`);

        // 1. Get Product
        const prodRes = await client.query(`SELECT id, sku, name, is_active FROM products WHERE sku = $1`, [sku]);
        if (prodRes.rowCount === 0) {
            console.log('❌ Producto no encontrado en tabla products');
            return;
        }
        const product = prodRes.rows[0];
        console.log('📦 Producto:', product);

        if (product.is_active) {
            console.log('⚠️ El producto sigue ACTIVO en la base de datos.');
        } else {
            console.log('✅ El producto está INACTIVO (Soft Deleted).');
        }

        // 2. Get Batches
        const batchesRes = await client.query(`SELECT id, product_id, sku, quantity_real, location_id FROM inventory_batches WHERE sku = $1`, [sku]);
        console.log(`📦 Batches encontrados: ${batchesRes.rowCount}`);

        for (const b of batchesRes.rows) {
            const locRes = await client.query('SELECT name FROM locations WHERE id = $1', [b.location_id]);
            const locName = locRes.rows[0]?.name || 'Unknown';
            console.log(`   - Batch ID: ${b.id} | Loc: ${locName} (${b.location_id}) | Qty: ${b.quantity_real} | ProdID: ${b.product_id}`);
        }

        // 3. Check for specific problematic location (if relevant)
        // Just generic check

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
