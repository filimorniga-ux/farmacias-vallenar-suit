
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

async function analyzeIspData() {
    try {
        console.log("Inspecting Nameless ISP Products...");

        // 1. Check what columns have data in these nameless rows
        const sampleRes = await pool.query(`
            SELECT 
                laboratory,
                format,
                isp_register,
                is_bioequivalent,
                dci
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND source_system = 'ISP'
            LIMIT 5
        `);
        console.log("\nSample Data in Nameless Rows:");
        console.table(sampleRes.rows);

        // 2. Check for Potential Matches in Real Inventory
        console.log("\nChecking for potential matches (by DCI) in real inventory...");

        // Let's take a DCI from the nameless list and see if it exists in 'real' products without ISP info
        const dciCheck = await pool.query(`
            WITH nameless_dcis AS (
                SELECT DISTINCT dci FROM products WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre') AND source_system = 'ISP' AND dci IS NOT NULL
            )
            SELECT 
                p.name as real_product_name,
                p.dci as real_product_dci,
                p.isp_register as current_isp_info,
                p.is_bioequivalent as current_bio_flag
            FROM products p
            JOIN nameless_dcis n ON p.dci = n.dci
            WHERE p.name IS NOT NULL AND p.name != 'Sin Nombre' AND p.name != ''
            AND (p.isp_register IS NULL OR p.isp_register = '')
            LIMIT 10
        `);

        console.log(`\nPotential Enrichment Targets (Real products with matching DCI but missing ISP info):`);
        if (dciCheck.rows.length === 0) {
            console.log("No obvious simple matches found.");
        } else {
            console.table(dciCheck.rows);
            console.log(`... and likely more.`);
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await pool.end();
    }
}

analyzeIspData();
