
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

async function main() {
    console.log("🚀 Starting Inventory Enrichment & Cleanup...");

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Nameless ISP Products with valuable data
        const res = await client.query(`
            SELECT id, dci, laboratory, isp_register, is_bioequivalent, format, stock_actual
            FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND source_system = 'ISP'
            AND dci IS NOT NULL 
            AND dci != ''
        `);

        const namelessItems = res.rows;
        console.log(`Found ${namelessItems.length} nameless ISP items to process.`);

        let updatedCount = 0;
        let deletedCount = 0;

        let skippedLab = 0;
        const skippedStock = 0;

        console.log("Debug: First 3 items stock type:", typeof namelessItems[0]?.stock_actual, namelessItems[0]?.stock_actual);

        for (const [index, item] of namelessItems.entries()) {
            if (index < 5) console.log(`Debug Item ${index}: DCI=${item.dci}, Lab=${item.laboratory}, Stock=${item.stock_actual}`);

            // Normalize for matching
            const targetDci = item.dci?.trim();
            const targetLab = item.laboratory ? item.laboratory.trim() : null;

            // ENRICHMENT PHASE
            if (targetLab && targetDci) {
                // Find candidates in Real Inventory
                // We want products that:
                // 1. Are NOT the item itself (obviously)
                // 2. Have valid names
                // 3. Match DCI
                // 4. Match Laboratory (fuzzy ILIKE)
                const candidatesRes = await client.query(`
                    SELECT id, name, isp_register, is_bioequivalent
                    FROM products
                    WHERE (name IS NOT NULL AND name != '' AND name != 'Sin Nombre')
                    AND dci = $1
                    AND laboratory ILIKE $2
                `, [targetDci, targetLab]);

                if (candidatesRes.rows.length > 0) {
                    // Enrich all matches
                    for (const candidate of candidatesRes.rows) {
                        const needsUpdate = !candidate.isp_register || !candidate.is_bioequivalent;

                        if (needsUpdate) {
                            await client.query(`
                                UPDATE products
                                SET 
                                    isp_register = COALESCE(isp_register, $1),
                                    is_bioequivalent = COALESCE(is_bioequivalent, $2),
                                    updated_at = NOW()
                                WHERE id = $3
                            `, [item.isp_register, item.is_bioequivalent, candidate.id]);
                            updatedCount++;
                        }
                    }
                }
            } else {
                if (index < 5) console.log(` -> Skipping Enrichment: Missing Lab or DCI`);
                skippedLab++;
            }


            // DELETE the nameless item (if 0 stock)
            if (item.stock_actual <= 0) {
                await client.query('DELETE FROM products WHERE id = $1', [item.id]);
                deletedCount++;
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ SUCCESS:`);
        console.log(`- Enriched Real Products: ${updatedCount}`);
        console.log(`- Deleted Nameless Items: ${deletedCount}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR: Transaction rolled back.", error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
