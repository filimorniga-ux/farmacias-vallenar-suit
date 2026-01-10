
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    const res = await client.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(processed_title) as cleaned,
            (SELECT COUNT(*) FROM products) as products_count
        FROM inventory_imports
    `);
    console.log(res.rows[0]);
    await client.end();
}

check();
