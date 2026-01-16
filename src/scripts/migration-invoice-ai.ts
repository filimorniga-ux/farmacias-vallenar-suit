
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
    await client.connect();
    try {
        console.log("Running migration: Add supplier_product_name to product_suppliers...");

        // Add column if not exists
        await client.query(`
            ALTER TABLE product_suppliers 
            ADD COLUMN IF NOT EXISTS supplier_product_name TEXT;
        `);

        // Index for faster searching
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_product_suppliers_sku 
            ON product_suppliers(supplier_sku);
        `);

        // Composite index for looking up exact name match per supplier
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_product_suppliers_name 
            ON product_suppliers(supplier_id, supplier_product_name);
        `);

        console.log("✅ Migration successful.");
    } catch (e) {
        console.error("❌ Migration failed:", e);
    } finally {
        await client.end();
    }
}
main();
