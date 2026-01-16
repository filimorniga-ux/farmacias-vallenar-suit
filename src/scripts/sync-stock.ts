
import { Client } from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { AICatalogService } from '../services/ai-catalog'; // Import AI Service
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function syncStock() {
    try {
        await client.connect();
        console.log("🏪 Sincronizando Stock Real por Sucursal...");

        // 1. Get Location IDs map
        const locRes = await client.query('SELECT id, name FROM locations');
        const locMap: Record<string, string> = {};

        locRes.rows.forEach(r => {
            if (r.name.toUpperCase().includes('SANTIAGO')) locMap['SANTIAGO'] = r.id;
            if (r.name.toUpperCase().includes('COLCHAGUA')) locMap['COLCHAGUA'] = r.id;
        });

        if (!locMap['SANTIAGO'] || !locMap['COLCHAGUA']) {
            throw new Error("❌ No se encontraron las sucursales 'SANTIAGO' o 'COLCHAGUA' en la tabla locations.");
        }
        console.log("📍 Mapa de Sucursales:", locMap);

        // 2. Fetch Raw Stock Data grouped by Product (Code/Name)
        // Ideally we match by Barcode first, then normalized Title

        // Strategy: 
        // Iterate inventory_imports where stock > 0
        // Find or Create Product in 'products' table (Consolidation Logic)
        // Update 'inventory' table for that product + location

        // Since we are doing a "Reset", we might want to clear old inventory counts? 
        // Let's assume we are UPSERTING.

        // Get processed entries (Wait... processed_title is reset).
        // We need the processed_title to match effectively? 
        // Actually, we can do a partial sync now for items with Barcode, but we probably want to wait for AI for strict matching of names.
        // HOWEVER, the user asked to "Start with what we have".
        // Let's implement the script but using `raw_barcodes` as primary key for now.
        // Items without barcode will be skipped until AI cleans names again? 
        // No, let's match by `raw_title` EXACT match for now as fallback.

        const imports = await client.query(`
            SELECT id, raw_branch, raw_title, raw_stock, raw_barcodes, raw_price, normalized_category_id, normalized_lab_id, raw_expiry, raw_batch, raw_units, raw_isp_code
            FROM inventory_imports 
            WHERE raw_stock > 0 OR (raw_barcodes IS NOT NULL AND length(raw_barcodes) > 3)
        `);

        console.log(`📦 Procesando ${imports.rowCount} filas de stock...`);

        let updated = 0;
        let created = 0;

        for (const row of imports.rows) {
            // raw_branch might be null for Golan/Catalog
            const branchKey = row.raw_branch ? (
                row.raw_branch.toUpperCase().includes('SANTIAGO') ? 'SANTIAGO' :
                    row.raw_branch.toUpperCase().includes('COLCHAGUA') ? 'COLCHAGUA' : null
            ) : null;

            // if (!branchKey) continue; // OLD LOGIC: Skip if no branch
            // NEW LOGIC: Allow if branchKey matches OR if it's a Catalog Item (Golan)

            const locationId = branchKey ? locMap[branchKey] : null; // matches valid branch

            // Should we skip? 
            // If locationId is null AND we don't have catalog data (barcodes), skip.
            // But if we have barcodes, we proceed for Product Fusion/Creation.
            if (!locationId && (!row.raw_barcodes || row.raw_barcodes.length < 3)) {
                continue;
            }

            // FIND PRODUCT
            // 1. By Barcode
            let productId: string | null = null;

            if (row.raw_barcodes && row.raw_barcodes.length > 5) {
                const resP = await client.query('SELECT id FROM products WHERE barcode = $1', [row.raw_barcodes]);
                if (resP.rows.length > 0) productId = resP.rows[0].id;
            }

            // 2. By Exact Name (Fallback with normalization)
            if (!productId && row.raw_title) {
                // Using UPPER and TRIM for better matching
                const resP = await client.query('SELECT id FROM products WHERE TRIM(UPPER(name)) = TRIM(UPPER($1))', [row.raw_title]);
                if (resP.rows.length > 0) productId = resP.rows[0].id;
            }

            // CREATE PRODUCT IF MISSING (Temporary until AI Clean finishes?)
            // Actually, we should probably create "Pending" products so stock exists.
            if (!productId) {
                const sku = row.raw_barcodes ? row.raw_barcodes.split(',')[0].trim() : `GEN-${randomUUID().slice(0, 8).toUpperCase()}`;

                const newP = await client.query(`
                    INSERT INTO products (
                        id,
                        name, 
                        price, 
                        barcode,
                        sku, 
                        category_id,
                        laboratory_id,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                    ON CONFLICT (sku) DO UPDATE SET updated_at = NOW()
                    RETURNING id
                 `, [
                    randomUUID(),
                    row.raw_title,
                    Math.round(Number(row.raw_price) || 0),
                    row.raw_barcodes || null,
                    sku,
                    row.normalized_category_id,
                    row.normalized_lab_id
                ]);
                productId = newP.rows[0].id;
                created++;
            }

            // LINK IMPORT TO PRODUCT
            if (productId) {
                await client.query('UPDATE inventory_imports SET product_id = $1 WHERE id = $2', [productId, row.id]);

                // Update Units Info (Enrichment)
                // Update Units Info (Enrichment)
                if (row.raw_units) {
                    await client.query('UPDATE products SET units_per_box = $1 WHERE id = $2 AND units_per_box IS NULL', [row.raw_units, productId]);
                } else {
                    // AI Enrichment: If implied multiple units but not set
                    const nameUpper = row.raw_title.toUpperCase();
                    if (nameUpper.match(/X\s*(\d+)/) || nameUpper.includes('COMP') || nameUpper.includes('CAPS')) {
                        try {
                            // Only if not already set > 1
                            const check = await client.query('SELECT units_per_box FROM products WHERE id = $1', [productId]);
                            if (!check.rows[0].units_per_box || check.rows[0].units_per_box === 1) {
                                console.log(`🤖 AI Analyzing: ${row.raw_title}...`);
                                const aiData = await AICatalogService.parseProductMetadata(row.raw_title);
                                if (aiData.unitsPerBox > 1) {
                                    await client.query('UPDATE products SET units_per_box = $1, format = $2, is_bioequivalent = $3 WHERE id = $4',
                                        [aiData.unitsPerBox, aiData.format, aiData.isBioequivalent, productId]);
                                    console.log(`✅ AI Enriched: ${aiData.unitsPerBox} units`);
                                }
                            }
                        } catch (err) {
                            // Ignore AI errors to keep sync running
                        }
                    }
                }

                // Fusion Logic: Fill missing data if import has it
                if (row.raw_isp_code) {
                    await client.query('UPDATE products SET isp_register = $1 WHERE id = $2 AND (isp_register IS NULL OR isp_register = \'\')', [row.raw_isp_code, productId]);
                }
                if (row.raw_barcodes) {
                    await client.query('UPDATE products SET barcode = $1 WHERE id = $2 AND (barcode IS NULL OR barcode = \'\')', [row.raw_barcodes, productId]);
                }
                // Category/Lab fusion could be done here if we trusted the import IDs 100%.
                // For now, let's stick to key fields.
            }

            // UPDATE BATCHES (If available and location valid)
            if (productId && row.raw_batch && locationId) {
                await client.query(`
                    INSERT INTO product_batches (product_id, location_id, batch_number, expiration_date, stock, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (id) DO NOTHING 
                 `, [productId, locationId, row.raw_batch, row.raw_expiry, row.raw_stock]);
            }

            // UPDATE STOCK (Total) - Only if stock > 0 AND location valid
            if (row.raw_stock > 0 && locationId) {
                await client.query(`
                    INSERT INTO inventory (product_id, location_id, stock, min_stock, max_stock, updated_at)
                    VALUES ($1, $2, $3, 10, 100, NOW())
                    ON CONFLICT (product_id, location_id) 
                    DO UPDATE SET stock = EXCLUDED.stock, updated_at = NOW()
                `, [productId, locationId, row.raw_stock]);
            }

            updated++;
            if (updated % 500 === 0) process.stdout.write('.');
        }

        console.log(`\n✅ Stock Sincronizado: ${updated} items actualizados. ${created} productos nuevos creados.`);

    } catch (e) {
        console.error("Error syncing stock:", e);
    } finally {
        await client.end();
    }
}

syncStock();
