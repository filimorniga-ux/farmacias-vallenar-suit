
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkLocks() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const res = await pool.query(`
        SELECT 
            pid, 
            usename, 
            pg_blocking_pids(pid) as blocked_by, 
            query as query_snippet, 
            state, 
            now() - query_start as duration 
        FROM pg_stat_activity 
        WHERE pid <> pg_backend_pid()
        AND state <> 'idle'
        ORDER BY duration DESC;
    `);

    console.log('🔒 Active Locks/Queries:', res.rows);
    await pool.end();
}

checkLocks();
