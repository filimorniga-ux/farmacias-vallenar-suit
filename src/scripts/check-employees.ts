
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkEmployees() {
    console.log('🕵️‍♂️ Checking Employees and their Locations...');
    try {
        const res = await pool.query(`
            SELECT id, name, email, role, assigned_location_id 
            FROM users 
            ORDER BY role, name
        `);
        console.table(res.rows);

        console.log('\n📍 Active Locations:');
        const locRes = await pool.query(`SELECT id, name, is_active FROM locations WHERE is_active = true`);
        console.table(locRes.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkEmployees();
