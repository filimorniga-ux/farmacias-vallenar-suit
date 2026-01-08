const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchemas() {
    try {
        const usersCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'id';
        `);
        console.log('Users ID:', usersCols.rows);

        const itemsCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'quote_items' AND column_name = 'quote_id';
        `);
        console.log('QuoteItems quote_id:', itemsCols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkSchemas();
