
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

async function check() {
    try {
        const res = await pool.query("SELECT COUNT(*) FROM products WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')");
        console.log("Remaining Nameless Items:", res.rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
