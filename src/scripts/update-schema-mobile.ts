
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function updateSchema() {
    const { query } = await import('../lib/db');
    try {
        console.log('📱 Updating Schema for Mobile Optimization...');

        // 1. Add barcode column if not exists
        await query(`
            ALTER TABLE inventory_batches 
            ADD COLUMN IF NOT EXISTS barcode TEXT;
        `);
        console.log('✅ Column barcode added (if not existed)');

        // 2. Add Indexes for O(1) Lookup
        // SKU Index
        await query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_batches(sku);
        `);
        console.log('✅ SKU Index created');

        // Barcode Index
        await query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory_batches(barcode);
        `);
        console.log('✅ Barcode Index created');

        // 3. Populate barcode with SKU for existing items (fallback) where barcode is null
        await query(`
            UPDATE inventory_batches 
            SET barcode = sku 
            WHERE barcode IS NULL;
        `);
        console.log('✅ Populated empty barcodes with SKU');

    } catch (e) {
        console.error('❌ Error updating schema:', e);
        process.exit(1);
    }
    process.exit(0);
}

updateSchema();
