const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Inspecting audit_action_catalog columns...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const query = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_action_catalog'
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
