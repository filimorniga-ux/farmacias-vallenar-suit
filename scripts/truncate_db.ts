
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function truncate() {
    console.log('🗑️  Wiping inventory tables...');
    try {
        const client = await pool.connect();
        try {
            await client.query('TRUNCATE TABLE lotes, productos RESTART IDENTITY CASCADE;');
            console.log('✅ Tables truncated successfully.');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error truncating tables:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

truncate();
