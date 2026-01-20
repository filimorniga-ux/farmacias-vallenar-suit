
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

async function run() {
    try {
        console.log("🚀 Executing Bulk Cleanup...");
        const res = await pool.query(`
            DELETE FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND source_system = 'ISP'
            AND stock_actual <= 0
        `);
        console.log(`✅ Deleted ${res.rowCount} records.`);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}
run();
