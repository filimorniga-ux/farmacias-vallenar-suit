
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('--- INVENTORY TABLE ---');
        const inv = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'inventory'
        `);
        console.table(inv.rows);

        console.log('--- INVENTORY BATCHES TABLE ---');
        const batches = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'inventory_batches'
        `);
        console.table(batches.rows);

        console.log('--- INVENTORY MOVEMENTS TABLE ---');
        const movs = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'inventory_movements'
        `);
        console.table(movs.rows);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
