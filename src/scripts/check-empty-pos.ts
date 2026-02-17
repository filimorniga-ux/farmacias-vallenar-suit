
import { pool } from '../lib/db';

async function main() {
    console.log('🔍 Investigating empty Purchase Orders...');

    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT po.id, po.status, po.created_at, po.supplier_id,
                   (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) as item_count
            FROM purchase_orders po
            WHERE po.status = 'APPROVED'
            ORDER BY po.created_at DESC;
        `);

        console.table(res.rows);

        const emptyPOs = res.rows.filter(r => parseInt(r.item_count) === 0);
        console.log(`\nFound ${emptyPOs.length} empty POs in APPROVED status.`);

        if (emptyPOs.length > 0) {
            console.log('IDs of empty POs:');
            emptyPOs.forEach(po => console.log(` - ${po.id}`));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        process.exit();
    }
}

main();
