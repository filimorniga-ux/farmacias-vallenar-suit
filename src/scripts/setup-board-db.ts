
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB for Board Setup...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️  Creating Board Notes Table...');

        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS board_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                content TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT, -- e.g. 'Vendedor', 'Bodeguero', 'Admin'
                branch TEXT, -- e.g. 'Farmacia Central'
                created_by UUID, -- Reference to user ID (optional but good for strict matching)
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
            );
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_board_created_at ON board_notes (created_at DESC);`);

        console.log('✅ Board Notes Table Created.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
