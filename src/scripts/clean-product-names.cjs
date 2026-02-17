const { Client } = require('pg');
require('dotenv').config();

async function cleanAllNames() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        // 1. Clean Master Products
        const productsRes = await client.query(`
      SELECT id, sku, name 
      FROM products 
      WHERE name LIKE '[AL DETAL]%' 
         OR name LIKE '%[AL DETAL]%'
    `);

        console.log(`Found ${productsRes.rows.length} master products with name corruption.`);

        for (const row of productsRes.rows) {
            const cleaned = row.name.replace(/\[AL DETAL\]/gi, '').trim();
            if (cleaned !== row.name) {
                console.log(`Fixing Master SKU ${row.sku}: "${row.name}" -> "${cleaned}"`);
                await client.query('UPDATE products SET name = $1 WHERE id = $2', [cleaned, row.id]);
            }
        }

        // 2. Clean Batches that are NOT retail lots but have the prefix
        const batchesRes = await client.query(`
      SELECT id, sku, name, is_retail_lot 
      FROM inventory_batches 
      WHERE (name LIKE '[AL DETAL]%' OR name LIKE '%[AL DETAL]%')
        AND (is_retail_lot = FALSE OR is_retail_lot IS NULL)
    `);

        console.log(`Found ${batchesRes.rows.length} non-retail batches with name corruption.`);

        for (const row of batchesRes.rows) {
            const cleaned = row.name.replace(/\[AL DETAL\]/gi, '').trim();
            if (cleaned !== row.name) {
                console.log(`Fixing Batch ID ${row.id} (SKU ${row.sku}): "${row.name}" -> "${cleaned}"`);
                await client.query('UPDATE inventory_batches SET name = $1 WHERE id = $2', [cleaned, row.id]);
            }
        }

        // 3. Ensure Retail Lots DO have the prefix
        const retailRes = await client.query(`
      SELECT ib.id, ib.name, p.name as master_name
      FROM inventory_batches ib
      JOIN products p ON ib.product_id::text = p.id::text
      WHERE ib.is_retail_lot = TRUE
        AND ib.name NOT LIKE '[AL DETAL]%'
    `);

        console.log(`Found ${retailRes.rows.length} retail batches missing prefix.`);
        for (const row of retailRes.rows) {
            const expectedName = `[AL DETAL] ${row.master_name}`;
            console.log(`Adding prefix to Retail Batch ${row.id}: "${row.name}" -> "${expectedName}"`);
            await client.query('UPDATE inventory_batches SET name = $1 WHERE id = $2', [expectedName, row.id]);
        }

        console.log('Deep cleanup completed successfully.');

    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        await client.end();
    }
}

cleanAllNames();
