
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    try {
        const total = await client.query('SELECT COUNT(*) FROM inventory_imports');
        const cleaned = await client.query('SELECT COUNT(*) FROM inventory_imports WHERE processed_title IS NOT NULL');
        const products = await client.query('SELECT COUNT(*) FROM products');
        const linked = await client.query('SELECT COUNT(*) FROM inventory_imports WHERE product_id IS NOT NULL');

        console.log({
            total: total.rows[0].count,
            cleaned: cleaned.rows[0].count,
            products_count: products.rows[0].count,
            synced_stock: linked.rows[0].count
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

check();
