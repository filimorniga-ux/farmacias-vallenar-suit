
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    console.log('🔍 Investigating empty Purchase Orders (Standalone)...');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL missing');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();

        const res = await client.query(`
            SELECT po.id, po.status, po.created_at, po.supplier_id,
                   (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) as item_count
            FROM purchase_orders po
            WHERE po.status = 'APPROVED'
            ORDER BY po.created_at DESC;
        `);

        console.log('Purchase Orders in APPROVED status:');
        console.table(res.rows);

        const emptyPOs = res.rows.filter(r => parseInt(r.item_count) === 0);
        console.log(`\nFound ${emptyPOs.length} empty POs.`);

        if (emptyPOs.length > 0) {
            console.log('Drafting deletion plan...');
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
