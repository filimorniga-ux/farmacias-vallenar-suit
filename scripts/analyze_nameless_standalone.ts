
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.error(".env not found at", envPath);
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

async function analyzeNameless() {
    try {
        console.log("Analyzing nameless products (Standalone)...");

        // 1. Count Total Nameless
        const countRes = await pool.query(`
            SELECT COUNT(*) 
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
        `);
        const total = countRes.rows[0].count;
        console.log(`\nTotal Nameless Products: ${total}`);

        if (parseInt(total) === 0) {
            console.log("No nameless products found.");
            await pool.end();
            return;
        }

        // 2. Breakdown by Source System
        const sourceRes = await pool.query(`
            SELECT source_system, COUNT(*) 
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            GROUP BY source_system
        `);
        console.log("\nBreakdown by Source System:");
        console.table(sourceRes.rows);

        // 3. Breakdown by Stock Presence
        const stockRes = await pool.query(`
            SELECT 
                CASE WHEN stock_actual > 0 THEN 'Has Stock' ELSE 'No Stock' END as status,
                COUNT(*)
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            GROUP BY 1
        `);
        console.log("\nBreakdown by Stock:");
        console.table(stockRes.rows);

        // 4. Sample Rows (Top with stock)
        const sampleRes = await pool.query(`
            SELECT id, sku, dci, laboratory, stock_actual, source_system, is_bioequivalent
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND stock_actual > 0
            ORDER BY stock_actual DESC
            LIMIT 5
        `);

        if (sampleRes.rows.length > 0) {
            console.log("\nSample Products WITH STOCK:");
            console.table(sampleRes.rows);
        }

        // 5. Check if DCI is available for these Name-less items
        const dciCheck = await pool.query(`
            SELECT 
                COUNT(*) as count_with_dci
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND dci IS NOT NULL AND dci != ''
        `);
        console.log(`\nNameless items that have a DCI (Active Ingredient): ${dciCheck.rows[0].count_with_dci}`);


    } catch (error) {
        console.error("Error analyzing:", error);
    } finally {
        await pool.end();
    }
}

analyzeNameless();
