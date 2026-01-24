
import 'dotenv/config'; // Load .env file
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Pool } from 'pg';

const CSV_PATH = path.join(process.cwd(), 'data_imports', 'good master_inventory_FINAL - master_inventory.csv');

interface InventoryRecord {
    SKU: string;
    Name: string;
    Units?: string;
}

// Helper to chunk arrays
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

async function run() {
    let pool: Pool | null = null;
    let client = null;
    try {
        console.log('🚀 Iniciando actualización de units_per_box desde nombres de productos...');

        if (!process.env.DATABASE_URL) {
            console.error('❌ CRITICAL: DATABASE_URL environment variable is not set!');
            process.exit(1);
        }

        // Initialize PG Pool
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }, // Typically needed for cloud DBs
        });

        if (!fs.existsSync(CSV_PATH)) {
            console.error(`❌ Archivo no encontrado: ${CSV_PATH}`);
            process.exit(1);
        }

        const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        }) as InventoryRecord[];

        console.log(`📊 Total registros en CSV: ${records.length}`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Regex Patterns in priority order
        const patterns = [
            /X\s*(\d+)\s*(?:COMP|CAP|TAB|GRA|TABL|SOB|SACH|AMP|VIAL|FRAS|DOSIS|ML|G|GR|GRAMOS|UNID|UND|CM)/i,
            /(\d+)\s*(?:COMP|CAP|TAB|GRA|TABL|SOB|SACH|AMP|VIAL|FRAS|DOSIS|UNID|UND)/i,
            /PACK\s*X\s*(\d+)/i,
            /X\s*(\d+)\s*$/i, // X 10 at end of string
            /X\s*(\d+)[^0-9a-zA-Z]/i, // X 10 followed by non-alphanumeric (like dot or comma)
            /X\s*(\d+)/i, // Catch-all X 10
        ];

        client = await pool.connect();

        try {
            console.log('🔄 Iniciando transacción con Batching...');
            await client.query('BEGIN');

            let updateValues: [string, number][] = [];

            for (const record of records) {
                const sku = record.SKU;
                const name = record.Name;

                if (!sku || !name) {
                    skippedCount++;
                    continue;
                }

                let units = 1;
                let success = false;

                // Try to match patterns in Name
                for (const pattern of patterns) {
                    const match = name.match(pattern);
                    if (match && match[1]) {
                        units = parseInt(match[1], 10);
                        if (!isNaN(units) && units > 0) {
                            success = true;
                            break;
                        }
                    }
                }

                // Fallback: Check "Units" column
                if (!success && record.Units) {
                    const unitsCol = record.Units;
                    for (const pattern of patterns) {
                        const match = unitsCol.match(pattern);
                        if (match && match[1]) {
                            units = parseInt(match[1], 10);
                            if (!isNaN(units) && units > 0) {
                                success = true;
                                break;
                            }
                        }
                    }
                }

                if (success && units > 1) {
                    updateValues.push([sku, units]);
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            }

            console.log(`⚡ Preparando actualización masiva de ${updateValues.length} productos...`);

            // Execute in chunks of 500 to avoid query size limits
            const chunks = chunkArray(updateValues, 500);

            for (const chunk of chunks) {
                // Construct query: UPDATE products as p SET units_per_box = v.units FROM (VALUES ('sku1', 1), ('sku2', 2)) as v(sku, units) WHERE p.sku = v.sku
                const valuesString = chunk.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2}::int)`).join(', ');
                const flatParams = chunk.flatMap(([sku, units]) => [sku, units]);

                const queryText = `
                    UPDATE products as p 
                    SET units_per_box = v.units 
                    FROM (VALUES ${valuesString}) as v(sku, units) 
                    WHERE p.sku = v.sku
                `;

                await client.query(queryText, flatParams);
                process.stdout.write('.');
            }

            await client.query('COMMIT');
            console.log('\n💾 Transacción completada exitosamente.');

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('🔥 Error en la transacción, haciendo ROLLBACK:', error);
            errorCount++;
            throw error;
        } finally {
            client.release();
        }

        console.log('\n\n✅ Finalizado!');
        console.log(`Total procesados: ${records.length}`);
        // console.log(`Encontrados con >1 unidad: ${updateValues.length}`); // Not available here
        console.log(`Omitidos: ${skippedCount}`);
        console.log(`Errores (general): ${errorCount}`);

    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

run();
