const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    const client = await pool.connect();
    try {
        console.log('--- AUDIT_ACTION_CATALOG COLUMNS ---');
        const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'audit_action_catalog';
    `);
        console.table(cols.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

check();
