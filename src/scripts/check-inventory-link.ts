import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🕵️‍♂️ Checking Inventory Links...');
    const client = await pool.connect();

    try {
        console.log('\n1. Locations & Default Warehouses:');
        const locs = await client.query(`
            SELECT id, name, type, default_warehouse_id 
            FROM locations 
        `);
        console.table(locs.rows);

        console.log('\n2. Warehouses:');
        const whs = await client.query(`
            SELECT id, name, location_id 
            FROM warehouses
        `);
        console.table(whs.rows);

        console.log('\n3. Inventory Count by Warehouse:');
        const inv = await client.query(`
            SELECT warehouse_id, count(*) as batch_count, sum(quantity_real) as total_stock 
            FROM inventory_batches 
            GROUP BY warehouse_id
        `);
        console.table(inv.rows);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
