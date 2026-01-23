
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
});

const INPUT_FILE = 'data_imports/master_inventory.json';

async function importInventory() {
    console.log('🚀 Starting OPTIMIZED DB Import (Bulk Mode)...');

    try {
        const data = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), INPUT_FILE), 'utf-8'));
        console.log(`📦 Loaded ${data.length} items from JSON.`);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // NOTE: We assume the table is empty or we don't care about conflicts for this fresh import.
            // But to be safe, we will use ON CONFLICT DO NOTHING (though we expect clean DB).
            // Actually, we wiped it, so we can just INSERT.

            const BATCH_SIZE = 500;
            let totalInserted = 0;

            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                console.log(`Processing batch ${i} to ${i + batch.length}...`);

                // 1. Prepare values for PRODUCTOS
                const productValues: any[] = [];
                const productPlaceholders: string[] = [];
                let pIndex = 1;

                batch.forEach((item: any) => {
                    const nombre = item.originalName || item.name;
                    const dci = item.activeIngredients ? item.activeIngredients.join(', ').substring(0, 255) : '';
                    const categoria = item.category || 'FARMACIA';
                    const precio = item.price || 0;

                    let condicion = 'LIBRE';
                    const rec = item.prescriptionType ? item.prescriptionType.toString().toUpperCase() : '';
                    if (rec.includes('RETENIDA')) condicion = 'RECETA_RETENIDA';
                    else if (rec.includes('RECETA') || rec.includes('SIMPLE')) condicion = 'RECETA_SIMPLE';

                    const costo = Math.floor(precio * 0.6);

                    productValues.push(nombre, dci, categoria, condicion, precio, costo);
                    productPlaceholders.push(`($${pIndex}, $${pIndex + 1}, $${pIndex + 2}, $${pIndex + 3}, $${pIndex + 4}, $${pIndex + 5}, true)`);
                    pIndex += 6;
                });

                const queryProducts = `
                    INSERT INTO productos (nombre, dci, categoria, condicion_venta, precio_venta, costo_compra, activo)
                    VALUES ${productPlaceholders.join(', ')}
                    RETURNING id, nombre
                `;

                const resProducts = await client.query(queryProducts, productValues);

                // Map names to IDs for Lotes insertion
                const nameToId = new Map();
                resProducts.rows.forEach((r: any) => nameToId.set(r.nombre, r.id));

                // 2. Prepare values for LOTES
                const lotValues: any[] = [];
                const lotPlaceholders: string[] = [];
                let lIndex = 1;

                batch.forEach((item: any) => {
                    const nombre = item.originalName || item.name;
                    const pid = nameToId.get(nombre);
                    if (pid) {
                        lotValues.push(pid);
                        lotPlaceholders.push(`($${lIndex}, 'INI-2025', '2026-12-31', 100, 'DISPONIBLE', 1)`);
                        lIndex += 1;
                    }
                });

                if (lotPlaceholders.length > 0) {
                    const queryLotes = `
                        INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, estado, bodega_id)
                        VALUES ${lotPlaceholders.join(', ')}
                    `;
                    await client.query(queryLotes, lotValues);
                }

                totalInserted += resProducts.rows.length;
                console.log(`   ✅ Batch complete. Total inserted: ${totalInserted}`);
            }

            await client.query('COMMIT');
            console.log(`🎉 Import Success! Total records: ${totalInserted}`);

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('❌ Import Failed:', e.message);
        console.error(e);
    } finally {
        await pool.end();
    }
}

importInventory();
