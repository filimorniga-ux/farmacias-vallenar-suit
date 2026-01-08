const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkQuotes() {
    try {
        const cols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'quotes' AND column_name = 'id';
        `);
        console.log('ID Column:', cols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkQuotes();
