import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🩺 Starting Price Doctor (Data Repair)...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Synthesize Prices in Master
        console.log('💊 Injecting Synthetic Prices into Products...');
        // Logic: Generate random price between 1000 and 50000 (steps of 100)
        const updateProductsRes = await client.query(`
            UPDATE products
            SET 
                sale_price = (floor(random() * 490) + 10) * 100, -- 1000 to 50000
                cost_price = ((floor(random() * 490) + 10) * 100) * 0.6
            WHERE sale_price IS NULL OR sale_price = 0
        `);
        console.log(`✅ Updated ${updateProductsRes.rowCount} products with new random prices.`);

        // 2. Propagate to Inventory
        console.log('🔄 Syncing Products -> Inventory Batches...');
        const updateBatchesRes = await client.query(`
            UPDATE inventory_batches ib
            SET 
                price_sell_box = p.sale_price,
                sale_price = p.sale_price,
                unit_cost = p.cost_price
            FROM products p
            WHERE ib.product_id::text = p.id::text
        `);
        console.log(`✅ Synced ${updateBatchesRes.rowCount} inventory batches.`);

        // 3. Propagate to Recent Sales (Optional but requested)
        // Only updating items that have 0 price to avoid rewriting history that might have been correct once
        console.log('💰 Repairing Sale Items (fixing 0/null prices)...');
        const updateSalesRes = await client.query(`
            UPDATE sale_items si
            SET unit_price = ib.price_sell_box,
                total_price = (si.quantity * ib.price_sell_box)
            FROM inventory_batches ib
            WHERE si.batch_id = ib.id
            AND (si.unit_price IS NULL OR si.unit_price = 0)
        `);
        console.log(`✅ Repaired ${updateSalesRes.rowCount} sale items.`);

        await client.query('COMMIT');
        console.log('🎉 Data Repair Complete. System should be operational.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error repairing data:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
