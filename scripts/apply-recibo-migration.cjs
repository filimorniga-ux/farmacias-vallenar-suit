const pg = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Applying migration...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const sql = fs.readFileSync('migrations/migrate_boletas_to_recibos.sql', 'utf8');
        await pool.query(sql);
        console.log('✅ Migration applied successfully.');

        // Verify
        const res = await pool.query("SELECT dte_type, COUNT(*) FROM sales GROUP BY dte_type");
        console.table(res.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
