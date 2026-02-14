
require('dotenv').config();
const { Pool } = require('pg');

async function listLatestUsers() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing from env');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query(`
            SELECT id, name, rut, role, created_at, is_active 
            FROM users 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('Latest 5 users:');
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

listLatestUsers();
