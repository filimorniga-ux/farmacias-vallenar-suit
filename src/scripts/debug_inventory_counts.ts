
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || '';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function verifyData() {
    try {
        console.log('--- Connecting to DB ---');

        console.log('\n--- TOTAL PRODUCTS ---');
        const resTotal = await pool.query(`SELECT COUNT(*) as total FROM products`);
        console.log('Total Products in Table:', resTotal.rows[0].total);

        console.log('\n--- PRODUCTS BY CATEGORY ---');
        const resCat = await pool.query(`SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC`);
        console.table(resCat.rows);

        console.log('\n--- PRODUCTS BY LOCATION ---');
        const resLoc = await pool.query(`SELECT location_id, COUNT(*) as count FROM products GROUP BY location_id ORDER BY count DESC`);
        console.table(resLoc.rows);

        console.log('\n--- INVENTORY BATCHES ---');
        const resBatches = await pool.query(`SELECT COUNT(*) as total FROM inventory_batches`);
        console.log('Total Batches:', resBatches.rows[0].total);

        console.log('\n--- TEST QUERY "MEDICAMENTO%" ---');
        const resMed = await pool.query(`SELECT COUNT(*) as count FROM products WHERE category ILIKE 'MEDICAMENTO%'`);
        console.log('Products matching ILIKE "MEDICAMENTO%":', resMed.rows[0].count);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

verifyData();
