import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const CSV_PATH = path.join(process.cwd(), 'data_imports', 'good master_inventory_FINAL - master_inventory.csv');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
});

// Helper para parsear unidades
function parseUnits(unitsStr: string): number {
    if (!unitsStr) return 1;
    const match = unitsStr.toUpperCase().match(/X\s*(\d+)/);
    if (match && match[1]) return parseInt(match[1], 10);
    const matchStart = unitsStr.match(/^(\d+)/);
    if (matchStart && matchStart[1]) return parseInt(matchStart[1], 10);
    return 1;
}

// Normalizar texto para mejorar matching
function normalize(str: string) {
    if (!str) return '';
    return str.trim().toUpperCase().replace(/\s+/g, ' ');
}

async function bulkEnrich() {
    console.log('🚀 Iniciando Migración Rápida (Bulk Update)...');

    // 1. Leer CSV
    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
    console.log(`📂 Leídos ${records.length} registros del CSV.`);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. Crear Tabla Temporal
        console.log('🏗️ Creando tabla temporal...');
        await client.query(`
            CREATE TEMP TABLE temp_csv_updates (
                csv_name TEXT,
                csv_barcodes TEXT,
                laboratory TEXT,
                dci TEXT,
                is_bioequivalent BOOLEAN,
                description TEXT,
                units_per_box INT,
                format TEXT,
                normalized_name TEXT
            ) ON COMMIT DROP;
            
            CREATE INDEX idx_temp_norm_name ON temp_csv_updates (normalized_name);
        `);

        // 3. Insertar datos en batches
        console.log('📥 Insertando datos en tabla temporal...');
        const batchSize = 1000;
        let processed = 0;

        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const values: any[] = [];
            const placeholders: string[] = [];

            batch.forEach((row: any, idx: number) => {
                const barcodes = row.Barcodes ? row.Barcodes : '';
                const units = parseUnits(row.Units);
                const format = row.Units || row.Concentration ? `${row.Units || ''} ${row.Concentration || ''}`.trim() : null;
                const normalizedName = normalize(row.Name);

                // Params count per row: 9
                const offset = idx * 9;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`);

                values.push(
                    row.Name,
                    barcodes,
                    row.Laboratory || null,
                    row.ActiveIngredients || null,
                    row.Bioequivalent?.toLowerCase() === 'true',
                    row.Description || null,
                    units > 1 ? units : 1, // Default to 1 if not parsed correctly
                    format,
                    normalizedName
                );
            });

            const query = `
                INSERT INTO temp_csv_updates (
                    csv_name, csv_barcodes, laboratory, dci, is_bioequivalent, description, units_per_box, format, normalized_name
                ) VALUES ${placeholders.join(',')}
            `;

            await client.query(query, values);
            processed += batch.length;
            process.stdout.write(`\rCargados: ${processed}/${records.length}`);
        }
        console.log('\n✅ Carga temporal completada.');

        // 4. Ejecutar UPDATE Masivo con JOINS
        // Estrategia:
        // A. Match por Nombre Exacto (Normalizado)
        // B. (Opcional) Match por Barcode dentro de SKU si falló el nombre (más complejo en SQL puro si SKU es array, pero SKU es text aquí).

        console.log('🔄 Ejecutando UPDATE masivo en products...');

        const updateQuery = `
            WITH updates AS (
                SELECT 
                    p.id,
                    t.laboratory,
                    t.dci,
                    t.is_bioequivalent,
                    t.description,
                    t.units_per_box,
                    t.format
                FROM products p
                JOIN temp_csv_updates t ON TRIM(UPPER(p.name)) = t.normalized_name
                -- Evitar updates innecesarios donde ya existe info (opcional, aquí sobreescribimos preferentemente con el maestro)
            )
            UPDATE products p
            SET 
                laboratory = COALESCE(u.laboratory, p.laboratory),
                dci = COALESCE(u.dci, p.dci),
                is_bioequivalent = COALESCE(u.is_bioequivalent, p.is_bioequivalent),
                description = COALESCE(u.description, p.description),
                units_per_box = COALESCE(u.units_per_box, p.units_per_box),
                format = COALESCE(u.format, p.format),
                updated_at = NOW()
            FROM updates u
            WHERE p.id = u.id;
        `;

        const res = await client.query(updateQuery);
        console.log(`🔥 Registros actualizados: ${res.rowCount}`);

        await client.query('COMMIT');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración rápida:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

bulkEnrich();
