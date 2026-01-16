const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Checking audit_action_catalog for PRODUCT_QUICK_CREATED...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const query = `SELECT * FROM audit_action_catalog WHERE action_code = 'PRODUCT_QUICK_CREATED'`;
        const res = await pool.query(query);
        if (res.rows.length === 0) {
            console.log('❌ Action code PRODUCT_QUICK_CREATED NOT FOUND');
        } else {
            console.log('✅ Action code found:', res.rows[0]);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
