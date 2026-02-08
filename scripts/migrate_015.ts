
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Connection String from .env
const connectionString = "postgres://tsdbadmin:sx0c226s5wbwh8ry@o1fxkrx8c7.m1xugm0lj9.tsdb.cloud.timescale.com:35413/tsdb?sslmode=no-verify";

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Timescale Cloud
});

async function migrate() {
    try {
        console.log('🔌 Connecting to TimescaleDB...');
        const client = await pool.connect();
        try {
            const sqlPath = path.join(process.cwd(), 'db/migrations/015_add_detailed_break_times.sql');
            const sql = fs.readFileSync(sqlPath, 'utf8');

            console.log('📜 Executing SQL:', sql);
            await client.query(sql);

            console.log('✅ Migration COMPLETE!');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Migration Critical Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
