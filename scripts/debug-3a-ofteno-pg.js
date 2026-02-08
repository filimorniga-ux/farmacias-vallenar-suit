
const { Client } = require('pg');

async function checkProductAndBatches() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pharmadb' // Fallback or use env
    });

    try {
        await client.connect();
        const searchTerm = '%3A ofteno%';

        // Find products
        const productsRes = await client.query(
            `SELECT id, name, sku FROM products WHERE name ILIKE $1`,
            [searchTerm]
        );

        console.log(`Found ${productsRes.rows.length} products matching '${searchTerm}'`);

        for (const p of productsRes.rows) {
            console.log(`\nProduct: ${p.name} (ID: ${p.id}, SKU: ${p.sku})`);
            // Check batches
            const batchesRes = await client.query(
                `SELECT id, lot_number, quantity_real, location_id, warehouse_id, created_at, supplier_id, invoice_number 
             FROM inventory_batches WHERE product_id = $1 ORDER BY created_at DESC`,
                [p.id]
            );
            console.log(`- Batches found: ${batchesRes.rows.length}`);
            batchesRes.rows.forEach(b => {
                console.log(`  - Batch ID: ${b.id}, Lot: ${b.lot_number}, Qty: ${b.quantity_real}, Loc: ${b.location_id}, Created: ${b.created_at}, Supp: ${b.supplier_id}, Inv: ${b.invoice_number}`);
            });
        }

    } catch (error) {
        console.error('Error checking data:', error);
    } finally {
        await client.end();
    }
}

checkProductAndBatches();
