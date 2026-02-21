
import pg from 'pg';
const { Pool } = pg;

const dbUrl = "postgres://tsdbadmin:nxdbe4pq4cpwhq4j@q64exeso6s.m1xugm0lj9.tsdb.cloud.timescale.com:35210/tsdb?sslmode=require";

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

async function test() {
    console.log("Checking DB connection count...");
    try {
        const client = await pool.connect();
        const res = await client.query("SELECT count(*) FROM pg_stat_activity WHERE datname = 'tsdb'");
        console.log(`Active connections to 'tsdb': ${res.rows[0].count}`);

        const resMax = await client.query("SHOW max_connections");
        console.log(`Max allowed connections: ${resMax.rows[0].max_connections}`);

        client.release();
    } catch (err) {
        console.error(`Error:`, err.message);
    } finally {
        await pool.end();
    }
}

test();
