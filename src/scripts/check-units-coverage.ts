
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();

    console.log("🔍 Analyzing Units Per Box Coverage...\n");

    const resTotal = await client.query('SELECT count(*) FROM products');
    const total = parseInt(resTotal.rows[0].count);

    const resUnits = await client.query('SELECT count(*) FROM products WHERE units_per_box > 1');
    const hasUnits = parseInt(resUnits.rows[0].count);

    console.log(`📦 Total Products: ${total}`);
    console.log(`💊 Products with Units > 1: ${hasUnits} (${((hasUnits / total) * 100).toFixed(1)}%)`);

    // Sample of products WITHOUT units but with potential in name
    const resSample = await client.query(`
        SELECT name, units_per_box 
        FROM products 
        WHERE (units_per_box IS NULL OR units_per_box <= 1)
        AND (name ~* 'X[0-9]+' OR name ~* '[0-9]+ *COMP' OR name ~* '[0-9]+ *CAPS')
        LIMIT 10
    `);

    console.log(`\n🧪 Sample of products needing extract (Current Units <= 1):`);
    console.table(resSample.rows);

    await client.end();
}
check();
