
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();

    console.log("🔍 Analyzing Golan Barcode Data...\n");

    // 1. Raw Distinct Barcodes in Golan Imports
    const resRaw = await client.query(`
        SELECT count(DISTINCT raw_barcodes) 
        FROM inventory_imports 
        WHERE source_file LIKE '%GOLAN%' 
        AND raw_barcodes IS NOT NULL 
        AND length(raw_barcodes) > 3
    `);
    console.log(`📦 Distinct Valid Barcodes in Golan Files: ${resRaw.rows[0].count}`);

    // 2. Raw Total Rows with Barcodes in Golan Imports
    const resTotal = await client.query(`
        SELECT count(*) 
        FROM inventory_imports 
        WHERE source_file LIKE '%GOLAN%' 
        AND raw_barcodes IS NOT NULL 
        AND length(raw_barcodes) > 3
    `);
    console.log(`📄 Total Rows with Barcodes in Golan Files: ${resTotal.rows[0].count}`);

    // 3. Products in DB with Barcodes (that likely came from Golan or matched)
    const resProducts = await client.query(`
        SELECT count(*) FROM products 
        WHERE barcode IS NOT NULL 
        AND length(barcode) > 3
    `);
    console.log(`✅ Total Unified Products with Barcodes: ${resProducts.rows[0].count}`);

    // 4. Missing Barcodes?
    // Find barcodes in Golan that are NOT in Products
    const resMissing = await client.query(`
        SELECT DISTINCT raw_barcodes 
        FROM inventory_imports 
        WHERE source_file LIKE '%GOLAN%' 
        AND raw_barcodes IS NOT NULL 
        AND length(raw_barcodes) > 3
        AND raw_barcodes NOT IN (SELECT barcode FROM products WHERE barcode IS NOT NULL)
        LIMIT 5
    `);
    console.log(`❓ Missing Barcodes (Sample): ${resMissing.rows.length}`);
    if (resMissing.rows.length > 0) {
        console.table(resMissing.rows);
    }

    await client.end();
}
check();
