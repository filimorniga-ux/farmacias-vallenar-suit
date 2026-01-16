
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    await client.connect();
    try {
        // 1. Add columns to inventory_imports
        await client.query(`
            ALTER TABLE inventory_imports 
            ADD COLUMN IF NOT EXISTS raw_batch TEXT,
            ADD COLUMN IF NOT EXISTS raw_expiry DATE,
            ADD COLUMN IF NOT EXISTS raw_units INTEGER;
        `);

        // 2. Create product_batches table
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_batches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id TEXT NOT NULL, /* Linked to products.id which is varchar/text in some places? No, product_id in inventory is text, products.id is varchar */
                location_id UUID NOT NULL REFERENCES locations(id),
                batch_number TEXT NOT NULL,
                expiration_date DATE,
                stock INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
            CREATE INDEX IF NOT EXISTS idx_batches_location ON product_batches(location_id);
        `);

        console.log("✅ Schema updated for Batches.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

migrate();
