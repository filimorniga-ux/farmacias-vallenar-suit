
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function backfillIsp() {
    await client.connect();
    console.log("🔌 Connected. Backfilling ISP Codes to Products table...");

    try {
        // Update Products table leveraging the link established in inventory_imports
        // We take the MAX(raw_isp_code) in case multiple imports point to same product, assuming they are consistent.
        const res = await client.query(`
            UPDATE products p
            SET isp_register = sub.isp_code
            FROM (
                SELECT product_id, MAX(raw_isp_code) as isp_code
                FROM inventory_imports
                WHERE product_id IS NOT NULL 
                  AND raw_isp_code IS NOT NULL 
                  AND raw_isp_code != ''
                GROUP BY product_id
            ) sub
            WHERE p.id = sub.product_id
            AND (p.isp_register IS NULL OR p.isp_register = '')
        `);

        console.log(`✅ Backfill Complete. Updated ${res.rowCount} products with ISP Codes.`);

    } catch (error) {
        console.error("❌ Error backfilling:", error);
    } finally {
        await client.end();
    }
}

backfillIsp();
