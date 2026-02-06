const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: undefined // Local Docker DB
    });

    try {
        await client.connect();

        console.log('🔍 Buscando ID...');
        const res = await client.query('SELECT id FROM quotes ORDER BY created_at DESC LIMIT 1');
        if (res.rows.length === 0) {
            console.log('❌ No quotes found');
            return;
        }
        const quoteId = res.rows[0].id;
        console.log(`✅ Testing with Quote ID: ${quoteId}`);

        // QUERY CORREGIDA (Sin ORDER BY created_at)
        const itemsRes = await client.query(`
            SELECT 
                qi.*,
                p.name as product_name,
                p.sku
            FROM quote_items qi
            LEFT JOIN products p ON qi.product_id = p.id
            WHERE qi.quote_id = $1
        `, [quoteId]);

        console.log(`✅ Query Successful! Found ${itemsRes.rows.length} items.`);
        console.log(itemsRes.rows);

    } catch (e) {
        console.error('❌ Query Failed:', e.message);
    } finally {
        await client.end();
    }
}

run();
