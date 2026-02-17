const { Client } = require('pg');
require('dotenv').config();

async function checkProcurementForSku(sku) {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log(`Checking procurement for SKU: ${sku}`);

        // This is a simplified version of the procurement query to verify stock grouping
        const query = `
        SELECT 
            p.id, p.sku, p.name,
            SUM(ib.quantity_real) as total_stock,
            COUNT(ib.id) as batch_count,
            bool_or(ib.is_retail_lot) as has_retail
        FROM products p
        JOIN inventory_batches ib ON ib.product_id::text = p.id::text
        WHERE p.sku = $1
        GROUP BY p.id, p.sku, p.name
    `;

        const res = await client.query(query, [sku]);
        console.table(res.rows);

        if (res.rows.length > 0) {
            console.log('Product found in stock grouping. The Sugerido de Pedido should see it.');
        } else {
            console.log('Product NOT found in stock grouping. Check joins.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

const skuToTable = process.argv[2] || '50003';
checkProcurementForSku(skuToTable);
