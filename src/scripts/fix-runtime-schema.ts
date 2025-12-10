
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🔧 Starting Runtime Schema Fix...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fix Customers Table
        console.log('   👤 Fixing Customers Table...');
        await client.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
        `);

        // 2. Fix Performance / Indices
        console.log('   🚀 creating Indices for Performance...');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory_batches(warehouse_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_batches(product_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sales_location ON sales(location_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);
        `);

        await client.query('COMMIT');
        console.log('✅ Schema Fix Applied Successfully.');

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('❌ Schema Fix Failed:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
