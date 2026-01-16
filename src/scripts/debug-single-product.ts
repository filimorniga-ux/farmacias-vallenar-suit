
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    // SKU from image: 7804677770388
    const res = await client.query("SELECT id, name, units_per_box, price, price_sell_unit FROM products WHERE sku = '7804677770388'");
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}
check();
