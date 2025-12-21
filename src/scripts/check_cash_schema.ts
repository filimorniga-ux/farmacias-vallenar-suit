
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const { Client } = pg;
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkSchema() {
    console.log('Connecting to:', process.env.POSTGRES_URL ? 'POSTGRES_URL defined' : 'No POSTGRES_URL');

    const client = new Client({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cash_movements';
        `);
        console.log('Columns in cash_movements:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

checkSchema();
