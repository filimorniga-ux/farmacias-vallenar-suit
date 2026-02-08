
import pg from 'pg';
const { Client } = pg;

async function checkProductAndBatches() {
    // Explicitly using the connection string from .env
    const connectionString = "postgres://tsdbadmin:sx0c226s5wbwh8ry@o1fxkrx8c7.m1xugm0lj9.tsdb.cloud.timescale.com:35413/tsdb?sslmode=no-verify";

    console.log('Connecting to DB...');

    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false } // Needed for some SSL connections
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

            if (batchesRes.rows.length > 0) {
                batchesRes.rows.forEach(b => {
                    console.log(`  - Batch ID: ${b.id}, Lot: ${b.lot_number}, Qty: ${b.quantity_real}, Loc: ${b.location_id}, Created: ${b.created_at}, Supp: ${b.supplier_id}, Inv: ${b.invoice_number}`);
                });
            } else {
                console.log('  - No batches found for this product.');
            }
        }

    } catch (error) {
        console.error('Error checking data:', error);
    } finally {
        await client.end();
    }
}

checkProductAndBatches();
