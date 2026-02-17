
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const dbUrl = process.env.DATABASE_URL;
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();

        // This simulates the logic I added to getPurchaseOrderHistory
        console.log('🧪 Verifying PO -> Items Linkage in DB...');

        const pos = await client.query('SELECT id, status FROM purchase_orders ORDER BY created_at DESC LIMIT 5');
        const ids = pos.rows.map(r => r.id);

        if (ids.length > 0) {
            const items = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ANY($1)', [ids]);

            pos.rows.forEach(po => {
                const poItems = items.rows.filter(i => i.purchase_order_id === po.id);
                console.log(`PO: ${po.id} | Status: ${po.status} | Items: ${poItems.length}`);
                if (poItems.length > 0) {
                    console.log(`  - Item: ${poItems[0].name}`);
                }
            });
        }

        client.release();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

main();
