
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();

    // 1. Raw Imports Count
    const resImports = await client.query('SELECT count(*) FROM inventory_imports');
    console.log(`\n📦 Total Raw Imports (Filas procesadas/a procesar): ${resImports.rows[0].count}`);

    // Breakdown by Source
    const resSources = await client.query('SELECT source_file, count(*) FROM inventory_imports GROUP BY source_file ORDER BY count(*) DESC');
    console.table(resSources.rows);

    // 2. Unified Products Count
    const resProducts = await client.query('SELECT count(*) FROM products');
    console.log(`\n📚 Total Unified Products (Catálogo Final): ${resProducts.rows[0].count}`);

    // 3. Products with Barcode (Quality Check)
    const resBarcodes = await client.query("SELECT count(*) FROM products WHERE barcode IS NOT NULL AND barcode != '' AND length(barcode) > 3");
    console.log(`🏷️  Products with Barcodes: ${resBarcodes.rows[0].count}`);

    await client.end();
}
check();
