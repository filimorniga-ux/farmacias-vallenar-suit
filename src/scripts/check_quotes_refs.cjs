const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkQuotesColumns() {
    try {
        const cols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'quotes' 
            AND column_name IN ('user_id', 'location_id', 'created_by');
        `);
        console.log('Quotes Columns:', cols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkQuotesColumns();
