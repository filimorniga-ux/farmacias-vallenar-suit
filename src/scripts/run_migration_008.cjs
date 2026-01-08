const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        console.log('🔌 Connecting to DB...');
        const client = await pool.connect();

        try {
            console.log('📜 Reading migration file...');
            const migrationPath = path.join(__dirname, '../db/migrations/008_add_sales_history_view_audit.sql');
            const sql = fs.readFileSync(migrationPath, 'utf8');

            console.log('🚀 Executing migration...');
            await client.query(sql);

            console.log('✅ Migration executed successfully!');
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('❌ Error executing migration:', e);
    } finally {
        pool.end();
    }
}

runMigration();
