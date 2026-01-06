
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Checking for missing columns...');

        // 1. Check sale_items.product_name
        const itemRes = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'sale_items' AND column_name = 'product_name'
        `);

        if (itemRes.rowCount === 0) {
            console.log('➕ Adding product_name to sale_items...');
            await client.query(`
                ALTER TABLE sale_items 
                ADD COLUMN product_name TEXT;
            `);
            console.log('✅ Added product_name.');
        } else {
            console.log('✅ product_name already exists.');
        }

        // 2. Check sales.queue_ticket_id
        const saleRes = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'sales' AND column_name = 'queue_ticket_id'
        `);

        if (saleRes.rowCount === 0) {
            console.log('➕ Adding queue_ticket_id to sales...');
            await client.query(`
                ALTER TABLE sales 
                ADD COLUMN queue_ticket_id UUID;
            `);
            console.log('✅ Added queue_ticket_id.');
        } else {
            console.log('✅ queue_ticket_id already exists.');
        }

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
})();
