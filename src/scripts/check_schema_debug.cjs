const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    const client = await pool.connect();
    try {
        console.log('--- TABLES ---');
        const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('locations', 'warehouses');
    `);
        console.table(tables.rows);

        if (tables.rows.find(t => t.table_name === 'warehouses')) {
            console.log('--- WAREHOUSES COLUMNS ---');
            const wCols = await client.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'warehouses';
      `);
            console.table(wCols.rows);
        }

        if (tables.rows.find(t => t.table_name === 'locations')) {
            console.log('--- LOCATIONS COLUMNS ---');
            const lCols = await client.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'locations';
      `);
            console.table(lCols.rows);
        }

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

check();
