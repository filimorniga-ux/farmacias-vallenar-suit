
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        console.log('Connected to DB');

        const queries = [
            `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'products'`,
            `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'sale_items'`,
            `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'purchase_order_items'`
        ];

        for (const q of queries) {
            console.log(`\nExecuting: ${q}`);
            const res = await client.query(q);
            console.table(res.rows);
        }

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchema();
