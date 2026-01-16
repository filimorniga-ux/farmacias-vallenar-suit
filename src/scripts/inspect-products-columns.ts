
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    // Get column names for products table
    const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'products';
    `);
    console.table(res.rows);
    await client.end();
}
check();
