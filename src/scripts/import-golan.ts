import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

function cleanPrice(priceStr: string): number {
    if (!priceStr) return 0;
    // Remove $, dots (thousands), keeping commas? Or dots as thousands?
    // CL format: "$1.000" -> 1000. "$ 1.500" -> 1500.
    // Replace non-numeric except maybe comma?
    // Assuming Chilean format: dot = thousand separator, comma = decimal (usually unused in retail price).
    // Safest: remove all non-digits.
    const clean = priceStr.replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
}

async function main() {
    console.log('🚢 Starting Golan Import Process...');
    const client = await pool.connect();

    try {
        // 1. Read CSV
        const csvPath = path.resolve(process.cwd(), 'golan.csv');
        if (!fs.existsSync(csvPath)) {
            throw new Error(`File not found: ${csvPath}`);
        }

        console.log(`📖 Reading ${csvPath}...`);
        const content = fs.readFileSync(csvPath);

        // 2. Parse CSV
        const records = parse(content, {
            from_line: 2, // Skip header
            skip_empty_lines: true,
            delimiter: ';',
            bom: true
        });

        console.log(`📊 Found ${records.length} records. Processing...`);

        await client.query('BEGIN');

        let updatedCount = 0;
        let createdCount = 0;
        let processed = 0;
        const BATCH_SIZE = 50; // Commit every 50 to avoid timeout/locking

        for (const row of records) {
            // Mapping: Col 1(B)=Name, Col 2(C)=SKU, Col 5(F)=Price
            const nameRaw = row[1];
            const skuRaw = row[2];
            const priceRaw = row[5];

            if (!skuRaw) continue;

            const name = nameRaw?.trim() || 'SIN NOMBRE';
            const sku = skuRaw?.trim();
            const price = cleanPrice(priceRaw);

            if (price <= 0) continue;

            const cost = Math.round(price * 0.6);

            // 3. Upsert Product
            const updateRes = await client.query(`
                UPDATE products 
                SET name = $1, sale_price = $2, cost_price = $3
                WHERE sku = $4
                RETURNING id
            `, [name, price, cost, sku]);

            let productId: string;

            if ((updateRes.rowCount ?? 0) > 0) {
                updatedCount++;
                productId = updateRes.rows[0].id;
            } else {
                productId = uuidv4();
                await client.query(`
                    INSERT INTO products (id, sku, name, sale_price, cost_price, stock_min, stock_max)
                    VALUES ($1, $2, $3, $4, $5, 5, 20)
                `, [productId, sku, name, price, cost]);
                createdCount++;
            }

            // 4. Sync Inventory Batches
            await client.query(`
                UPDATE inventory_batches 
                SET price_sell_box = $1, sale_price = $1, unit_cost = $2
                WHERE product_id::text = $3::text
            `, [price, cost, productId]);

            // 5. Sync Sale Items
            await client.query(`
                UPDATE sale_items
                SET unit_price = $1
                WHERE batch_id IN (SELECT id FROM inventory_batches WHERE product_id::text = $2::text)
            `, [price, productId]);

            processed++;
            if (processed % BATCH_SIZE === 0) {
                process.stdout.write(`\r⏳ Processed ${processed}/${records.length} records...`);
                await client.query('COMMIT');
                await client.query('BEGIN');
            }
        }
        console.log(`\n✅ Upsert Complete. Updated: ${updatedCount}, Created: ${createdCount}`);

        // 6. Recalculate Sale Item Totals & Sale Totals
        console.log('💰 Recalculating Financial History...');

        // Recalc sale_items total_price
        await client.query(`
            UPDATE sale_items
            SET total_price = quantity * unit_price
        `);

        // Recalc sales total (sum of items)
        const salesUpdateRes = await client.query(`
            UPDATE sales s
            SET total_amount = sub.new_total,
                total = sub.new_total
            FROM (
                SELECT sale_id, SUM(total_price) as new_total
                FROM sale_items
                GROUP BY sale_id
            ) sub
            WHERE s.id::text = sub.sale_id::text
        `);

        console.log(`💰 Sales Recalculated: ${salesUpdateRes.rowCount}`);

        await client.query('COMMIT');
        console.log('🎉 Import & Sync Completed Successfully.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error Importing Golan:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
