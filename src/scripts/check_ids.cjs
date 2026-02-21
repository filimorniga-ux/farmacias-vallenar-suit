
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkIds() {
    const ids = [
        '467525f5-8086-4dd7-9445-185ae573b409',
        '3973b5af-c630-40cd-bc0b-d2081321a067'
    ];

    try {
        for (const id of ids) {
            console.log(`Checking ID: ${id}`);

            const product = await pool.query('SELECT name, sku FROM products WHERE id = $1', [id]);
            if (product.rows.length > 0) {
                console.log(`- FOUND in PRODUCTS: ${product.rows[0].name} (SKU: ${product.rows[0].sku})`);
            } else {
                console.log(`- NOT found in products`);
            }

            const batch = await pool.query(`
        SELECT ib.id, ib.location_id, l.name as location_name 
        FROM inventory_batches ib
        LEFT JOIN locations l ON ib.location_id = l.id
        WHERE ib.id = $1
      `, [id]);
            if (batch.rows.length > 0) {
                console.log(`- FOUND in INVENTORY_BATCHES: Location ${batch.rows[0].location_name} (ID: ${batch.rows[0].location_id})`);
            } else {
                console.log(`- NOT found in inventory_batches`);
            }
        }

        // Also check location IDs
        const locations = await pool.query('SELECT id, name FROM locations');
        console.log('\nLocations:');
        console.table(locations.rows);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkIds();
