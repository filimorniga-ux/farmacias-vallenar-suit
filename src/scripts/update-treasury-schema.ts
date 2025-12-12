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

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️ Updating Treasury Schema (V3)...');

        // Add columns to treasury_remittances
        const columns = [
            'ADD COLUMN IF NOT EXISTS shift_start TIMESTAMP',
            'ADD COLUMN IF NOT EXISTS shift_end TIMESTAMP',
            'ADD COLUMN IF NOT EXISTS cash_count_diff NUMERIC(12, 2) DEFAULT 0',
            'ADD COLUMN IF NOT EXISTS notes TEXT'
        ];

        for (const col of columns) {
            await client.query(`ALTER TABLE treasury_remittances ${col}`);
            console.log(`   + Applied: ${col}`);
        }

        console.log('✅ Treasury Schema Updated successfully.');

    } catch (e) {
        console.error('Error updating schema:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
