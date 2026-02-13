
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function debugLocations() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Debugging Locations Table...');
        const locRes = await pool.query('SELECT id, name FROM locations');
        console.table(locRes.rows);

        console.log('🔍 Debugging Users Table (Location assignments)...');
        const userRes = await pool.query('SELECT id, name, assigned_location_id FROM users WHERE assigned_location_id IS NOT NULL');
        console.table(userRes.rows);
    } catch (e) {
        console.error('❌ Error querying locations:', e);
    } finally {
        await pool.end();
    }
}

debugLocations();
