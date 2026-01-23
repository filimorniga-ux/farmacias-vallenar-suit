
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
});

const INPUT_FILE = 'data_imports/master_inventory.json';

async function reimportV2() {
    console.log('🚀 Starting V2 Import (Correct Tables)...');

    try {
        // 1. Load Data
        const rawData = fs.readFileSync(path.resolve(process.cwd(), INPUT_FILE), 'utf-8');
        const data = JSON.parse(rawData);
        console.log(`📦 Loaded ${data.length} items from JSON.`);

        const client = await pool.connect();
        try {
            // 2. Fetch Warehouses
            console.log('🔍 Fetching Warehouses...');
            const warehouseRes = await client.query('SELECT id, location_id, name FROM warehouses WHERE is_active = true');
            const warehouses = warehouseRes.rows;

            if (warehouses.length === 0) {
                throw new Error('No active warehouses found!');
            }
            console.log(`🏭 Found ${warehouses.length} warehouses:`, warehouses.map((w: any) => w.name).join(', '));

            // 3. Wipe Tables
            console.log('🗑️  Wiping `products` and `inventory_batches`...');
            await client.query('TRUNCATE TABLE products, inventory_batches CASCADE');
            console.log('✨ Tables clean.');

            // 4. Import Loop
            const BATCH_SIZE = 500;
            let totalProducts = 0;
            let totalBatches = 0;

            await client.query('BEGIN');

            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                console.log(`🔄 Processing batch ${i} - ${i + batch.length}...`);

                const productValues: any[] = [];
                const productPlaceholders: string[] = [];
                const batchValues: any[] = [];
                const batchPlaceholders: string[] = [];

                let pIndex = 1;
                let bIndex = 1;

                // Prepare Data
                for (const item of batch) {

                    // --- Product Mapping (Enriched) ---
                    const prodId = randomUUID();
                    const name = (item.name || '').substring(0, 255);
                    const sku = (item.sku || `SKU-${prodId.substring(0, 8)}`).substring(0, 100);
                    const barcode = (item.barcodes && item.barcodes.length > 0) ? item.barcodes.join(',') : sku;
                    const finalBarcode = barcode.substring(0, 255);

                    const price = item.price || 0;
                    const cost = Math.floor(price * 0.6); // Estimated cost
                    const category = (item.category || 'GENERAL').substring(0, 100);
                    const lab = (item.laboratory || 'GENERICO').substring(0, 100);
                    const dci = (item.activeIngredients?.join(', ') || item.dci || '').substring(0, 255);
                    const isBio = !!item.isBioequivalent;
                    const condicion = item.condicion || item.condition || 'VD'; // 'R' or 'VD'

                    // New Fields
                    const ispCode = (item.ispCode || '').substring(0, 100);
                    const therapeuticAction = (item.therapeuticAction || '').substring(0, 255);
                    const concentration = (item.concentration || '').substring(0, 100);
                    const units = (item.units || '').substring(0, 50);

                    productValues.push(
                        prodId, sku, name, category, dci, lab,
                        isBio, condicion, price, cost, finalBarcode, 400,
                        // New Values
                        ispCode, therapeuticAction, concentration, units
                    );

                    // ($1 ... $12) + 4 new ($13, $14, $15, $16)
                    productPlaceholders.push(`($${pIndex}, $${pIndex + 1}, $${pIndex + 2}, $${pIndex + 3}, $${pIndex + 4}, $${pIndex + 5}, $${pIndex + 6}, $${pIndex + 7}, $${pIndex + 8}, $${pIndex + 9}, $${pIndex + 10}, $${pIndex + 11}, $${pIndex + 12}, $${pIndex + 13}, $${pIndex + 14}, $${pIndex + 15})`);
                    pIndex += 16;

                    // --- Inventory Batches Mapping (Fan out to all warehouses) ---
                    for (const wh of warehouses) {
                        const batchId = randomUUID();
                        const lotNum = 'INI-2025';

                        batchValues.push(
                            batchId, prodId, wh.id, wh.location_id,
                            name, sku, lotNum,
                            100, // quantity_real
                            '2026-12-31', // expiry
                            10, 1000, price, cost
                        );

                        batchPlaceholders.push(`($${bIndex}, $${bIndex + 1}, $${bIndex + 2}, $${bIndex + 3}, $${bIndex + 4}, $${bIndex + 5}, $${bIndex + 6}, $${bIndex + 7}, $${bIndex + 8}, $${bIndex + 9}, $${bIndex + 10}, $${bIndex + 11}, $${bIndex + 12})`);
                        bIndex += 13;
                    }
                }

                // Insert Products
                if (productPlaceholders.length > 0) {
                    const qProd = `
                        INSERT INTO products (
                            id, sku, name, category, dci, laboratory, 
                            is_bioequivalent, condicion_venta, price, cost_net, barcode, stock_total,
                            isp_register, therapeutic_action, concentration, units,
                            created_at, updated_at
                        ) VALUES 
                        ${productPlaceholders.map(p => p.replace(')', ', NOW(), NOW())')).join(', ')}
                    `;
                    await client.query(qProd, productValues);
                    totalProducts += batch.length;
                }

                // Insert Batches
                if (batchPlaceholders.length > 0) {
                    const qBatch = `
                        INSERT INTO inventory_batches (
                            id, product_id, warehouse_id, location_id,
                            name, sku, lot_number,
                            quantity_real, expiry_date,
                            stock_min, stock_max, sale_price, unit_cost,
                            created_at, updated_at
                        ) VALUES
                        ${batchPlaceholders.map(b => b.replace(')', ', NOW(), NOW())')).join(', ')}
                    `;
                    await client.query(qBatch, batchValues);
                    totalBatches += (batch.length * warehouses.length);
                }
            }

            await client.query('COMMIT');
            console.log(`✅ Import V2 Success!`);
            console.log(`   - Products Created: ${totalProducts}`);
            console.log(`   - Batches Created: ${totalBatches} (across ${warehouses.length} warehouses)`);

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (e: any) {
        console.error('❌ Import V2 Failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

reimportV2();
