
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspectContent() {
    console.log('🔍 Inspecting Products Content...');
    try {
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT * FROM products LIMIT 3');
            console.log('PRODUCTS Sample:', res.rows);

            const batches = await client.query('SELECT * FROM inventory_batches LIMIT 3');
            console.log('BATCHES Sample:', batches.rows);

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

inspectContent();
