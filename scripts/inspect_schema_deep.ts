
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking Rules...');
        const rules = await client.query("SELECT * FROM pg_rules WHERE tablename = 'products'");
        console.log('📜 Rules:', rules.rows);

        console.log('🔍 Checking RLS...');
        const rls = await client.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'products'");
        console.log('🛡️ RLS Info:', rls.rows);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
inspect();
