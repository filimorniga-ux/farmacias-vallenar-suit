require('dotenv').config();
const { Pool } = require('pg');

async function checkRecentUsers() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing from env');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Checking DB directly...');

        // 1. Total Count
        const countRes = await pool.query('SELECT COUNT(*) FROM users');
        console.log(`📊 Total Users in DB: ${countRes.rows[0].count}`);

        // 2. Latest 5 Users
        const latestRes = await pool.query(`
            SELECT id, name, rut, role, created_at, is_active 
            FROM users 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        console.log('🆕 Latest 5 Users (Direct DB Query):');
        console.table(latestRes.rows.map(u => ({
            name: u.name,
            role: u.role,
            created: u.created_at.toISOString(),
            active: u.is_active
        })));

    } catch (e) {
        console.error('❌ Query failed:', e);
    } finally {
        await pool.end();
    }
}

checkRecentUsers();
