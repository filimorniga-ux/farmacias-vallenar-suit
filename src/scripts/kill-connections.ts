import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to kill connections:', connectionString ? 'URL Defined' : 'URL MISSING');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🔪 Attempting to kill all other database connections...');
    const client = await pool.connect();

    try {
        // Execute the kill query
        const sql = `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND usename = current_user;
        `;

        const result = await client.query(sql);

        console.log(`✅ All connections killed. Terminated ${result.rowCount} sessions.`);
        console.log('Database is free.');

    } catch (error) {
        console.error('❌ Error killing connections:', error);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

main();
