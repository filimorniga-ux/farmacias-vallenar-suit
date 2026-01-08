// Check customers table
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        // Check if customers table exists
        const tables = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name ILIKE '%customer%'
        `);
        console.log('Tables matching customer:', tables.rows.map(r => r.table_name));

        // If exists, count records
        const count = await pool.query('SELECT COUNT(*) as cnt FROM customers');
        console.log('Customer count:', count.rows[0].cnt);

        // Show recent ones
        const recent = await pool.query(`
            SELECT id, full_name, rut, created_at 
            FROM customers 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        console.log('Recent customers:');
        recent.rows.forEach(r => {
            console.log(`  - ${r.full_name} (${r.rut}) - ${r.created_at}`);
        });

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
}
main();
