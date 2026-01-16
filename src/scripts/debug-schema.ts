
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
    try {
        await client.connect();

        console.log('--- COLUMNS IN inventory_batches ---');
        const res = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'inventory_batches'
            ORDER BY ordinal_position;
        `);
        console.table(res.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
checkSchema();
