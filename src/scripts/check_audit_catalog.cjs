const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkCatalog() {
    try {
        const cols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_action_catalog';
        `);
        console.log('Columns:', cols.rows);

        const existing = await pool.query(`SELECT * FROM audit_action_catalog WHERE code = 'QUOTE_CREATED'`);
        console.log('Existing QUOTE_CREATED:', existing.rows);

        // Also check one example to see format
        const example = await pool.query(`SELECT * FROM audit_action_catalog LIMIT 1`);
        console.log('Example row:', example.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkCatalog();
