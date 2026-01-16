
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function syncRegulatoryData() {
    await client.connect();
    console.log("🔌 Connected to DB. Starting Regulatory Sync...");

    try {
        // 1. Get all products with an ISP register
        const res = await client.query(`
            SELECT id, isp_register, name 
            FROM products 
            WHERE isp_register IS NOT NULL AND isp_register != ''
        `);

        console.log(`📋 Found ${res.rowCount} products with ISP Register.`);

        let updated = 0;
        let notFound = 0;

        for (const product of res.rows) {
            // Clean ISP register (sometimes they have "F-1234/15" -> "F-1234")
            // Assuming strict match first

            // Lookup in isp_registry
            const ispRes = await client.query(`
                SELECT active_component, condition, is_bioequivalent, drug_class
                FROM isp_registry
                WHERE registration_number = $1
            `, [product.isp_register]);

            if (ispRes.rowCount && ispRes.rowCount > 0) {
                const info = ispRes.rows[0];

                // Normalize Condition
                let saleCondition = 'RECETA_SIMPLE';
                const cond = (info.condition || '').toUpperCase();
                if (cond.includes('DIRECTA')) saleCondition = 'VENTA_DIRECTA';
                if (cond.includes('RETENIDA')) saleCondition = 'RECETA_RETENIDA';
                if (cond.includes('CHEQUE')) saleCondition = 'RECETA_CHEQUE';

                // Heuristic for Cold Chain (since we don't have explicit field in isp_registry)
                // Words: VACUNA, INSULINA, REFRIGERA
                const isCold = /INSULINA|VACUNA|REFRIGERA|SUPOSITORIO/i.test(info.drug_class || '') ||
                    /INSULINA|VACUNA/i.test(info.active_component || '');

                await client.query(`
                    UPDATE products 
                    SET 
                        dci = $1,
                        is_bioequivalent = $2,
                        condicion_venta = $3,
                        es_frio = CASE WHEN $4 = true THEN true ELSE es_frio END, -- Only update if detected true, else keep original
                        updated_at = NOW()
                    WHERE id = $5
                `, [
                    info.active_component,
                    info.is_bioequivalent,
                    saleCondition,
                    isCold,
                    product.id
                ]);
                updated++;
            } else {
                notFound++;
                // console.log(`   ⚠️ ISP ${product.isp_register} not found in registry (Prod: ${product.name})`);
            }
        }

        console.log(`✅ Sync Complete.`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Not Found in ISP Registry: ${notFound}`);

    } catch (error) {
        console.error("❌ Error during sync:", error);
    } finally {
        await client.end();
    }
}

syncRegulatoryData();
