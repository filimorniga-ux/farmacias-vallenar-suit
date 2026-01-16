
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
    await client.connect();
    console.log("🔄 Recalculating Unit Prices based on Box Price / Units Per Box");

    // Logic:
    // 1. If units_per_box > 1
    // 2. Set price_sell_unit = price / units_per_box
    // 3. Set price_sell_box = price (ensure backward compatibility)

    // Check coverage first
    const resCount = await client.query('SELECT count(*) FROM products WHERE units_per_box > 1');
    console.log(`Found ${resCount.rows[0].count} products with units > 1 to attempt update.`);

    try {
        await client.query('BEGIN');

        // Update price_sell_box just in case it's null, using 'price' (Legacy)
        await client.query(`
            UPDATE products 
            SET price_sell_box = price 
            WHERE price_sell_box IS NULL OR price_sell_box = 0;
        `);

        // Update price_sell_unit
        // Using ROUND to avoid decimals in CLP
        const resUpdate = await client.query(`
            UPDATE products
            SET price_sell_unit = ROUND(price / units_per_box)
            WHERE units_per_box > 1 
            AND price > 0
            AND (price_sell_unit IS NULL OR price_sell_unit = 0 OR price_sell_unit = price); -- Only if not set or wrong (equal to box price)
        `);

        console.log(`✅ Updated ${resUpdate.rowCount} products with calculated Unit Price.`);

        // Optional: Recalculate cost_unit if column existed, but schema didn't show it.
        // If 'cost_price' is per box, we assume it is.
        // We assume cost_price is gross cost (with tax).

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error recalculating:", e);
    } finally {
        await client.end();
    }
}
run();
