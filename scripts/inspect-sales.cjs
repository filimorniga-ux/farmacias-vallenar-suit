const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Inspecting sales tables...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- sales ---');
        let res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales'");
        console.table(res.rows);

        console.log('--- sales_headers ---');
        res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales_headers'");
        console.table(res.rows);

        console.log('--- ventas ---');
        res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ventas'");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
