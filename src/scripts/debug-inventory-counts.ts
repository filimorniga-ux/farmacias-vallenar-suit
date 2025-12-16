
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkCounts() {
    try {
        console.log('--- LOCATIONS ---');
        const locations = await pool.query('SELECT id, name, is_active FROM locations ORDER BY name');
        console.table(locations.rows);

        console.log('--- INVENTORY COUNTS BY LOCATION ---');
        const counts = await pool.query(`
            SELECT location_id, count(*) as total_items 
            FROM inventory_batches 
            GROUP BY location_id
        `);
        console.table(counts.rows);

        // Join to be clear
        console.log('--- JOINED COUNTS ---');
        const joined = await pool.query(`
            SELECT l.name, l.id, count(ib.id) as total_items 
            FROM locations l
            LEFT JOIN inventory_batches ib ON l.id::text = ib.location_id::text
            GROUP BY l.id, l.name
            ORDER BY total_items DESC
        `);
        console.table(joined.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkCounts();
