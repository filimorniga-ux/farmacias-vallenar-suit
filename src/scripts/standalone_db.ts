
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
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
