
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️  Updating Users Table for Session Monitoring...');

        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1,
            ADD COLUMN IF NOT EXISTS current_context_data JSONB DEFAULT '{}'::jsonb;
        `);

        console.log('✅ Users Table Updated.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
