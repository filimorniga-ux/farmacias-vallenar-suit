
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function main() {
    try {
        const client = await pool.connect();
        const sqlPath = path.join(__dirname, '../migrations/enable_fuzzy_search.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration successful!');
        client.release();
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
main();
