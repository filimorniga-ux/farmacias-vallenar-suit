
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgres://tsdbadmin:nxdbe4pq4cpwhq4j@q64exeso6s.m1xugm0lj9.tsdb.cloud.timescale.com:35210/tsdb?sslmode=require"
});

async function checkTriggers() {
    try {
        const res = await pool.query(`
      SELECT 
        tgname AS trigger_name,
        proname AS function_name,
        prosrc AS function_source
      FROM pg_trigger
      JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
      JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
      WHERE pg_class.relname = 'inventory_batches'
    `);

        console.log('--- TRIGGERS ON inventory_batches ---');
        for (const row of res.rows) {
            console.log(`Trigger: ${row.trigger_name}`);
            console.log(`Function: ${row.function_name}`);
            console.log(`Source:\n${row.function_source}\n`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkTriggers();
