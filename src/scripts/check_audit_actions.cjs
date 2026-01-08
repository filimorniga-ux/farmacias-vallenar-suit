const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkActions() {
    try {
        console.log('--- Columns in audit_actions ---');
        const cols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_actions';
        `);
        console.log(cols.rows);

        console.log('--- Content of audit_actions ---');
        const res = await pool.query(`SELECT * FROM audit_actions ORDER BY code`);
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkActions();
