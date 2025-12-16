
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("=== INSPECTING SCHEMA ===");

        const tables = ['sales', 'sale_items', 'inventory_batches', 'inventory_movements'];

        for (const table of tables) {
            console.log(`\nTable: ${table}`);
            const res = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
