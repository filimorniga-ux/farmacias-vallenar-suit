import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function whereAmI() {
    const email = 'admin.centro@demo.cl'; // Tu usuario
    try {
        const res = await pool.query(`
        SELECT email, name, assigned_location_id FROM users
      `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
whereAmI();
