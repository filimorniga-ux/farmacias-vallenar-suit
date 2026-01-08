const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkCategories() {
    try {
        const res = await pool.query(`SELECT * FROM audit_categories`);
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkCategories();
