
import { query } from '../src/lib/db';
import * as dotenv from 'dotenv';
dotenv.config();

async function analyzeNameless() {
    try {
        console.log("Analyzing nameless products...");

        // 1. Count Total Nameless
        const countRes = await query(`
            SELECT COUNT(*) 
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
        `);
        const total = countRes.rows[0].count;
        console.log(`\nTotal Nameless Products: ${total}`);

        if (parseInt(total) === 0) {
            console.log("No nameless products found. Checking logic...");
            return;
        }

        // 2. Breakdown by Source System
        const sourceRes = await query(`
            SELECT source_system, COUNT(*) 
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            GROUP BY source_system
        `);
        console.log("\nBreakdown by Source System:");
        console.table(sourceRes.rows);

        // 3. Breakdown by Stock Presence
        const stockRes = await query(`
            SELECT 
                CASE WHEN stock_actual > 0 THEN 'Has Stock' ELSE 'No Stock' END as status,
                COUNT(*)
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            GROUP BY 1
        `);
        console.log("\nBreakdown by Stock:");
        console.table(stockRes.rows);

        // 4. Sample Rows (Top 5 with stock)
        const sampleRes = await query(`
            SELECT id, sku, dci, laboratory, stock_actual, source_system, is_bioequivalent
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND stock_actual > 0
            LIMIT 5
        `);

        if (sampleRes.rows.length > 0) {
            console.log("\nSample Products WITH STOCK:");
            console.table(sampleRes.rows);
        } else {
            console.log("\nNo nameless products with stock found.");
            // Sample without stock
            const sampleNoStock = await query(`
                SELECT id, sku, dci, laboratory, stock_actual, source_system
                FROM products 
                WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
                LIMIT 5
            `);
            console.log("\nSample Products WITHOUT Stock:");
            console.table(sampleNoStock.rows);
        }

    } catch (error) {
        console.error("Error analyzing:", error);
    }
    process.exit(0);
}

analyzeNameless();
