
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function inspect() {
    console.log('🔍 Inspecting QUOTES table (Retry)...');

    try {
        // Check RLS
        const rls = await pool.query(`
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE oid = 'quotes'::regclass
        `);
        console.log('🔒 RLS Enabled:', rls.rows[0]);

        // Count Total Quotes
        const count = await pool.query('SELECT COUNT(*) FROM quotes');
        console.log('📊 Total Quotes in DB:', count.rows[0].count);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

inspect();
