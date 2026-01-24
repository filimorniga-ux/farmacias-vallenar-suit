import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Configuración de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de Base de Datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

// Ruta del archivo CSV
const CSV_PATH = path.join(process.cwd(), 'data_imports', 'good master_inventory_FINAL - master_inventory.csv');

interface CSVRow {
    Name: string;
    SKU: string;
    Barcodes: string;
    Price: string;
    Stock: string;
    Category: string;
    Laboratory: string;
    ActiveIngredients: string;
    Bioequivalent: string;
    Description: string;
    ISP_Code: string;
    TherapeuticAction: string;
    Units: string; // ej: "X30COMP"
    Concentration: string;
    PrescriptionType: string;
}

// Helper para parsear unidades
function parseUnits(unitsStr: string): number {
    if (!unitsStr) return 1;
    // Intenta extraer número de patrones como "X30", "X 30", "30 COMP"
    const match = unitsStr.toUpperCase().match(/X\s*(\d+)/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    // Si inicia con número ej "30 Comprimidos"
    const matchStart = unitsStr.match(/^(\d+)/);
    if (matchStart && matchStart[1]) {
        return parseInt(matchStart[1], 10);
    }
    return 1;
}

async function enrichProducts() {
    console.log('🚀 Iniciando enriquecimiento de productos desde CSV Maestro...');

    if (!fs.existsSync(CSV_PATH)) {
        console.error(`❌ Archivo no encontrado: ${CSV_PATH}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const records: CSVRow[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    console.log(`📊 Total registros en CSV: ${records.length}`);

    const client = await pool.connect();
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    try {
        await client.query('BEGIN');

        for (const [index, row] of records.entries()) {
            if (index % 100 === 0) process.stdout.write(`\rProcesando: ${index}/${records.length}`);

            const name = row.Name;
            const barcodes = row.Barcodes ? row.Barcodes.split(',').map(b => b.trim()).filter(b => b.length > 0) : [];

            // Datos a actualizar
            const laboratory = row.Laboratory || null;
            const dci = row.ActiveIngredients || null;
            const isBio = row.Bioequivalent?.toLowerCase() === 'true';
            const description = row.Description || null;
            const units = parseUnits(row.Units);
            const format = row.Units || row.Concentration ? `${row.Units || ''} ${row.Concentration || ''}`.trim() : null;

            // Si no hay datos relevantes que actualizar, saltamos (para ahorrar queries)
            // Pero queremos asegurar que se actualicen si existen en el CSV y faltan en la DB
            if (!laboratory && !dci && !format) continue;

            let productId: string | null = null;
            let matchType = '';

            // 1. Intentar buscar por CODIGO DE BARRAS (si hay)
            if (barcodes.length > 0) {
                // Buscar si algún barcode coincide con el SKU de products (asumiendo que SKU a veces guarda barcode)
                // Ojo: en este esquema 'sku' en DB es texto.
                const res = await client.query(
                    'SELECT id FROM products WHERE sku = ANY($1::text[]) LIMIT 1',
                    [barcodes]
                );
                if (res.rows.length > 0) {
                    productId = res.rows[0].id;
                    matchType = 'barcode';
                }
            }

            // 2. Si no match, buscar por NOMBRE EXACTO (normalizado)
            if (!productId && name) {
                const res = await client.query(
                    'SELECT id FROM products WHERE TRIM(UPPER(name)) = TRIM(UPPER($1)) LIMIT 1',
                    [name]
                );
                if (res.rows.length > 0) {
                    productId = res.rows[0].id;
                    matchType = 'name';
                }
            }

            if (productId) {
                // Actualizar producto
                await client.query(`
                    UPDATE products 
                    SET 
                        laboratory = COALESCE($1, laboratory),
                        dci = COALESCE($2, dci),
                        is_bioequivalent = COALESCE($3, is_bioequivalent),
                        description = COALESCE($4, description),
                        units_per_box = COALESCE($5, units_per_box),
                        format = COALESCE($6, format),
                        updated_at = NOW()
                    WHERE id = $7
                `, [
                    laboratory,
                    dci,
                    isBio,
                    description,
                    units > 1 ? units : null, // Solo actualizar units si detectamos un pack > 1, sino dejar lo que estaba (o default 1)
                    format,
                    productId
                ]);
                updatedCount++;
            } else {
                notFoundCount++;
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ Migración COMPLETADA con éxito.');
        console.log(`📈 Resumen:
        - Total procesados CSV: ${records.length}
        - Actualizados en DB: ${updatedCount}
        - No encontrados en DB: ${notFoundCount}
        - Errores: ${errorCount}
        `);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error crítico, haciendo ROLLBACK:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

enrichProducts();
