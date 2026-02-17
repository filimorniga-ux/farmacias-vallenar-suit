
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgres://tsdbadmin:nxdbe4pq4cpwhq4j@q64exeso6s.m1xugm0lj9.tsdb.cloud.timescale.com:35210/tsdb?sslmode=require"
});

async function debugFractionation() {
    try {
        const skus = ['50083', '50003', '780467770371'];

        for (const sku of skus) {
            console.log(`\n=== DIAGNOSTIC FOR SKU: ${sku} ===`);

            // 1. Check Product Table
            const prodRes = await pool.query('SELECT id, name, sku, stock_total, is_active FROM products WHERE sku = $1', [sku]);
            console.log('--- PRODUCTS TABLE ---');
            console.table(prodRes.rows);

            // 2. Check Batches Table
            const batchRes = await pool.query(`
          SELECT 
            ib.id,
            ib.sku,
            ib.name,
            ib.quantity_real,
            ib.is_retail_lot,
            ib.original_batch_id,
            w.name as warehouse_name
          FROM inventory_batches ib
          JOIN warehouses w ON ib.warehouse_id = w.id
          WHERE ib.sku = $1
        `, [sku]);
            console.log('--- INVENTORY_BATCHES TABLE ---');
            console.table(batchRes.rows);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debugFractionation();
