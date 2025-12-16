
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkLocations() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Checking Locations ---');
        const res = await pool.query('SELECT id, name, type, is_active FROM locations ORDER BY name ASC');
        console.table(res.rows);
    } catch (error) {
        console.error('Error checking locations:', error);
    } finally {
        await pool.end();
    }
}

checkLocations();
