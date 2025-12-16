
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT sku, name, isp_register FROM products LIMIT 10');
        console.log('🔍 Muestra de productos en DB:');
        console.table(res.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
