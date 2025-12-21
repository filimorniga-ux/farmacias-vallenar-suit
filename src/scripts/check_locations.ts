import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkLocations() {
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    try {
        console.log('Checking locations table...');
        const res = await pool.query('SELECT * FROM locations');
        console.log('Locations found:', res.rows);

        if (res.rows.length > 0) {
            console.log('Sample ID type:', typeof res.rows[0].id);
            console.log('Sample ID value:', res.rows[0].id);
        }

        console.log('Attempting to check metadata...');
        const meta = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'queue_tickets' AND column_name = 'branch_id'");
        console.log('queue_tickets.branch_id type:', meta.rows[0]?.data_type);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

checkLocations();
