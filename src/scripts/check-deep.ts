
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkDeepDive() {
    const { query } = await import('../lib/db');
    try {
        console.log('🕵️‍♂️ Deep Dive Search...');

        // 1. Search for any sale ~790k
        const specificSale = await query("SELECT * FROM sales WHERE total_amount BETWEEN 780000 AND 800000");
        console.log('🎯 Sales around $790k:', specificSale.rows);

        // 2. Check Expenses for Today
        const startOfDay = '2025-12-10 00:00:00';
        const endOfDay = '2025-12-10 23:59:59';
        const expenses = await query(`SELECT SUM(amount) as total FROM expenses WHERE date >= $1 AND date <= $2`, [startOfDay, endOfDay]);
        console.log('💸 Expenses Today:', expenses.rows[0]);

        // 3. Search for any product price ~790k
        const product = await query("SELECT * FROM inventory_batches WHERE price_sell_unit BETWEEN 780 AND 800 OR price_sell_box BETWEEN 780000 AND 800000"); // Broad search
        console.log('💊 Products around 790:', product.rows);

    } catch (e) { console.error(e); }
    process.exit(0);
}
checkDeepDive();
