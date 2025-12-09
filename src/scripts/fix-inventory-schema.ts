import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to fix schema:', connectionString ? 'URL Defined' : 'URL MISSING');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🛠 Fixing Inventory Schema...');
    const client = await pool.connect();

    try {
        const sql = `
            ALTER TABLE inventory_batches 
            ADD COLUMN IF NOT EXISTS sale_price NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cost_net NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_sell_box NUMERIC(15, 2) DEFAULT 0;
        `;

        await client.query(sql);

        console.log('✅ Esquema Reparado (Columns added to inventory_batches)');

    } catch (error) {
        console.error('❌ Error fixing schema:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
