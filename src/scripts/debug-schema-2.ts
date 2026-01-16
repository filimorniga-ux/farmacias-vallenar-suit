
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
    try {
        await client.connect();

        console.log('--- TABLES ---');
        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('locations', 'warehouses')
        `);
        console.table(tables.rows);

        console.log('--- COLUMNS IN locations ---');
        const locCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'locations'
        `);
        console.table(locCols.rows);

        if (tables.rows.find(t => t.table_name === 'warehouses')) {
            console.log('--- COLUMNS IN warehouses ---');
            const warCols = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'warehouses'
            `);
            console.table(warCols.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
checkSchema();
