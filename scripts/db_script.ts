
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); // Prefer .env.local if exists

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ CRITICAL: DATABASE_URL not found in .env or .env.local');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export async function query(text: string, params?: any[]) {
    try {
        const res = await pool.query(text, params);
        return res;
    } catch (error) {
        console.error('❌ DB Error:', error);
        throw error;
    }
}

export async function closePool() {
    await pool.end();
}
