const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkLocations() {
    try {
        const cols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'locations';
        `);
        console.log('Columns:', cols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkLocations();
