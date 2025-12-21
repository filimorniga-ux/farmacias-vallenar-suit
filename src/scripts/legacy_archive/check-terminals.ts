import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.error('--- SCRIPT STARTING ---');
// console.error('DB URL:', process.env.DATABASE_URL); // Don't log secrets

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.error('Connecting...');
        const res = await pool.query('SELECT id, name, location_id, is_active, allowed_users FROM terminals');
        console.error('ROWS FOUND:', res.rows.length);
        console.table(res.rows);

        const locRes = await pool.query('SELECT id, name, is_active FROM locations');
        console.error('LOCATIONS FOUND:', locRes.rows.length);
        console.table(locRes.rows);

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await pool.end();
    }
}
check();
