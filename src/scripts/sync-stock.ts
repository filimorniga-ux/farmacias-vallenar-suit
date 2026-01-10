
import { Client } from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
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
            SELECT id, raw_branch, raw_title, raw_stock, raw_barcodes, raw_price, normalized_category_id, normalized_lab_id
            FROM inventory_imports 
            WHERE raw_stock > 0
        `);

        console.log(`📦 Procesando ${imports.rowCount} filas de stock...`);

        let updated = 0;
        let created = 0;

        for (const row of imports.rows) {
            if (!row.raw_branch) continue;
            const branchKey = row.raw_branch.toUpperCase().includes('SANTIAGO') ? 'SANTIAGO' :
                row.raw_branch.toUpperCase().includes('COLCHAGUA') ? 'COLCHAGUA' : null;

            if (!branchKey) continue; // Skip master list or unknown branch
            const locationId = locMap[branchKey];

            // FIND PRODUCT
            // 1. By Barcode
            let productId: string | null = null;

            if (row.raw_barcodes && row.raw_barcodes.length > 5) {
                const resP = await client.query('SELECT id FROM products WHERE barcode = $1', [row.raw_barcodes]);
                if (resP.rows.length > 0) productId = resP.rows[0].id;
            }

            // 2. By Exact Name (Fallback)
            if (!productId && row.raw_title) {
                const resP = await client.query('SELECT id FROM products WHERE name = $1', [row.raw_title]); // Using raw_title if name matches exactly
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
            }

            // UPDATE STOCK
            await client.query(`
                INSERT INTO inventory (product_id, location_id, stock, min_stock, max_stock, updated_at)
                VALUES ($1, $2, $3, 10, 100, NOW())
                ON CONFLICT (product_id, location_id) 
                DO UPDATE SET stock = EXCLUDED.stock, updated_at = NOW()
            `, [productId, locationId, row.raw_stock]);

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
