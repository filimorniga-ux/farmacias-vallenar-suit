const pg = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🚀 Applying products columns migration...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const sqlPath = path.join(__dirname, '../migrations/add_supplier_parsing_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL:');
        console.log(sql);

        await pool.query(sql);
        console.log('✅ Migration applied successfully');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await pool.end();
    }
}

main();
