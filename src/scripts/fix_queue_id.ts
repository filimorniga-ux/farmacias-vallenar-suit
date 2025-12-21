import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

async function fixQueueId() {
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    const query = (text: string, params?: any[]) => pool.query(text, params);

    try {
        console.log('🔧 Fixing Queue Tickets ID column...');

        // 1. Ensure pgcrypto extension exists for gen_random_uuid()
        await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
        console.log('✅ Extension pgcrypto ensured.');

        // 2. Add id column if not exists (although check_queue_columns showed it exists, we enforce the default)
        // We will ALTER the column to use gen_random_uuid()

        await query(`
            ALTER TABLE queue_tickets 
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
        `);
        console.log('✅ Default value set to gen_random_uuid().');

        // 3. Ensure Primary Key
        // Check if constraint exists, if not add it.
        // We saw "queue_tickets_pkey" exists on "id", so this might be redundant but safe to check visually or via IF NOT EXISTS logic in SQL (Postgres doesn't support ADD CONSTRAINT IF NOT EXISTS easily).
        // Since we confirmed it exists, we will skip re-adding it to avoid errors, or just log.
        console.log('ℹ️ Primary Key already verified in previous steps.');

        console.log('✅ Queue ID Schema Fixed Successfully');

    } catch (error) {
        console.error('❌ Queue Fix Failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixQueueId();
