import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Client } from 'pg';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import { randomUUID } from 'crypto';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data_imports');

// Interfaces
interface StandardRow {
    branch?: string;
    sku?: string;
    title?: string;
    category?: string;
    lab?: string;
    stock?: number;
    price?: number;
    isp?: string;
    barcodes?: string;
    batch?: string;
    expiry?: any;
    active_principle?: string;
    units?: number;
}

// Configuración de Mapeo
type ColumnMapping = {
    branch?: string;
    sku?: string;
    title: string; // Title is mandatory mostly
    category?: string;
    lab?: string;
    stock?: string;
    price?: string;
    isp?: string;
    barcodes?: string;
    batch?: string;
    expiry?: string;
    active_principle?: string;
    units?: string;
};

// Utils
const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

const parsePrice = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    // Remove non-numeric except dot and comma
    // Handle "1.500" as 1500 (CLP) -> usually just remove dots
    // Handle "1500.00" -> keep dot.
    // Heuristic: if contains ",", replace with "."? No, standard in CL is "," for decimal, "." for thousands.
    // If we just strip everything non-numeric, we get integers, which is safe for CLP.
    const clean = String(val).replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
};

const parseStock = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/[^0-9-]/g, '');
    return parseInt(clean, 10) || 0;
};

const parseBoolean = (val: string): boolean => {
    if (!val) return false;
    const lower = String(val).toLowerCase().trim();
    return ['si', 'sí', 'true', 'yes', 'verdadero'].includes(lower);
};

// ==========================================
// 1. IMPORTAR ISP (CSV MAESTRO)
// ==========================================
const importIspOficial = async (client: Client) => {
    const filename = 'isp_oficial.csv';
    const filePath = path.join(DATA_DIR, filename);
    console.log(`\n🔵 [ISP] Verificando ${filename}...`);

    if (!fs.existsSync(filePath)) {
        console.log(`   🔸 Salteado: No existe el archivo.`);
        return;
    }

    const batch: any[] = [];
    const processed = 0;

    // Promesa para stream
    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({ separator: ';' }))
            .on('data', (row) => {
                batch.push(row);
            })
            .on('end', async () => {
                console.log(`   📊 Leídas ${batch.length} filas. Insertando...`);
                // Insertar uno a uno (más lento pero más seguro para manejo de errores/duplicados simple)
                // O usar lotes grandes si fuera necesario.
                let inserted = 0;
                for (const row of batch) {
                    try {
                        const reg = row['Registro'] || row['registration_number'];
                        if (!reg) continue;

                        await client.query(`
                            INSERT INTO isp_registry (
                                registration_number, product_name, active_component, holder_name, drug_class, condition, is_bioequivalent
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (registration_number) DO NOTHING
                        `, [
                            reg,
                            row['Producto'],
                            row['Principio Activo'],
                            row['Titular'],
                            row['Uso / Tratamiento'],
                            row['Condición de venta'],
                            parseBoolean(row['Bioequivalente'])
                        ]);
                        inserted++;
                    } catch (err: any) {
                        // Ignorar errores puntuales
                    }
                }
                console.log(`   ✅ ISP Finalizado: ${inserted} registros nuevos.`);
                resolve();
            })
            .on('error', reject);
    });
};

// ==========================================
// GENERIC INSERTER FOR INVENTORY
// ==========================================
const insertInventoryBatch = async (client: Client, rows: StandardRow[], sourceName: string) => {
    const batchId = randomUUID();
    let count = 0;

    // Prepare statement text
    const query = `
        INSERT INTO inventory_imports (
            source_file, import_batch_id, 
            raw_branch, raw_sku, raw_title, raw_category, raw_lab, 
            raw_stock, raw_price, raw_isp_code, raw_barcodes,
            raw_batch, raw_expiry, raw_active_principle, raw_units,
            processed_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING')
    `;

    for (const row of rows) {
        try {
            await client.query(query, [
                sourceName,
                batchId,
                row.branch,
                row.sku,
                row.title,
                row.category,
                row.lab,
                row.stock,
                row.price,
                row.isp,

                row.barcodes,
                row.batch,
                row.expiry ? new Date(row.expiry) : null,
                row.active_principle,
                row.units
            ]);
            count++;
        } catch (e: any) {
            console.error(`   ❌ Error fila ${row.title}: ${e.message}`);
        }
    }
    return count;
};

// ==========================================
// 2. IMPORTAR INVENTARIO (EXCEL)
// ==========================================
const processInventoryExcel = async (client: Client, filename: string, source: string, map: ColumnMapping) => {
    const filePath = path.join(DATA_DIR, filename);
    console.log(`\n🟢 [XLSX] Procesando ${source} (${filename})...`);

    if (!fs.existsSync(filePath)) {
        console.log(`   🔸 Salteado: Archivo no existe.`);
        return;
    }

    try {
        const wb = xlsx.readFile(filePath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = xlsx.utils.sheet_to_json<any>(sheet);

        const normalizedRows: StandardRow[] = jsonRows.map(row => ({
            branch: map.branch ? row[map.branch] : undefined,
            sku: map.sku ? row[map.sku] : undefined,
            title: row[map.title],
            category: map.category ? row[map.category] : undefined,
            lab: map.lab ? row[map.lab] : undefined,
            stock: map.stock ? parseStock(row[map.stock]) : 0,
            price: map.price ? parsePrice(row[map.price]) : 0,
            isp: map.isp ? row[map.isp] : undefined,
            barcodes: map.barcodes ? row[map.barcodes] : undefined,
            batch: map.batch ? row[map.batch] : undefined,
            expiry: map.expiry ? row[map.expiry] : undefined,
            active_principle: map.active_principle ? row[map.active_principle] : undefined,
            units: map.units ? parseStock(row[map.units]) : 0,
        })).filter(r => r.title); // Filter empty titles

        console.log(`   📋 Filas leídas: ${normalizedRows.length}. Insertando en BD...`);
        const inserted = await insertInventoryBatch(client, normalizedRows, source);
        console.log(`   ✅ ${source}: ${inserted} insertados.`);

    } catch (err: any) {
        console.error(`   🔥 Error leyendo Excel ${filename}:`, err.message);
    }
};

// ==========================================
// 3. IMPORTAR INVENTARIO (CSV)
// ==========================================
const processInventoryCsv = async (client: Client, filename: string, source: string, separator: string, map: ColumnMapping) => {
    const filePath = path.join(DATA_DIR, filename);
    console.log(`\n🟠 [CSV] Procesando ${source} (${filename})...`);

    if (!fs.existsSync(filePath)) {
        console.log(`   🔸 Salteado: Archivo no existe.`);
        return;
    }

    const rows: StandardRow[] = [];

    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({ separator }))
            .on('data', (raw: any) => {
                if (!raw[map.title]) return;
                rows.push({
                    branch: map.branch ? raw[map.branch] : undefined,
                    sku: map.sku ? raw[map.sku] : undefined,
                    title: raw[map.title],
                    category: map.category ? raw[map.category] : undefined,
                    lab: map.lab ? raw[map.lab] : undefined,
                    stock: map.stock ? parseStock(raw[map.stock]) : 0,
                    price: map.price ? parsePrice(raw[map.price]) : 0,
                    isp: map.isp ? raw[map.isp] : undefined,
                    barcodes: map.barcodes ? raw[map.barcodes] : undefined,
                });
            })
            .on('end', async () => {
                console.log(`   📋 Filas leídas: ${rows.length}. Insertando en BD...`);
                const inserted = await insertInventoryBatch(client, rows, source);
                console.log(`   ✅ ${source}: ${inserted} insertados.`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`   🔥 Error stream CSV ${filename}:`, err.message);
                resolve(); // Don't crash main
            });
    });
};

// ==========================================
// MAIN ORCHESTRATOR
// ==========================================
const main = async () => {
    const client = getClient();
    try {
        await client.connect();
        console.log('🔌 DB Conectada.');

        // 1. ISP
        await importIspOficial(client);

        // 2. Inventarios Propios (XLSX)
        const commonMapping: ColumnMapping = {
            branch: 'SUCURSAL', sku: 'SKU', title: 'TITULO',
            category: 'CATEGORIA', lab: 'LABORATORIO',
            stock: 'STOCK', price: 'PRECIO', isp: 'CODIGO ISP', barcodes: 'CODIGOS_BARRA',
            active_principle: 'PRINCIPIOS ACTIVOS', units: 'UNIDADES'
        };
        await processInventoryExcel(client, 'farmacias vallenar santiago.xlsx', 'SANTIAGO', commonMapping);
        await processInventoryExcel(client, 'farmacias vallenar colchagua.xlsx', 'COLCHAGUA', commonMapping);

        // 3. Inventarios Externos (XLSX - Enriched)
        await processInventoryExcel(client, 'inventario_medicamentos_enriquecido.xlsx', 'ENRICHED', {
            title: 'Producto',
            isp: 'Registro ISP',
            barcodes: 'Código Barras',
            stock: 'Cantidad actual',
            batch: 'Lote',
            expiry: 'Fecha de vencimiento',
            category: 'Categoría',
            active_principle: 'Principio activo (DCI)',
            lab: 'Laboratorio'
        });

        // 4. Inventarios Externos (XLSX - Golan)
        // 4. Inventarios Externos (XLSX - Golan)
        await processInventoryExcel(client, 'inventario golan.xlsx', 'GOLAN_XLSX', {
            title: 'Producto',
            barcodes: 'Código Barras',
            stock: 'Stock',
            price: 'Precio Venta ', // Space at end is critical
            lab: 'marca',
            active_principle: 'dosis'
        });

        // 5. Inventarios Externos (CSV - Golan)
        await processInventoryCsv(client, 'golan.csv', 'GOLAN_CSV', ';', {
            title: 'Producto',
            barcodes: 'Código Barras',
            stock: 'Stock',
            price: 'Precio Venta',
            lab: 'marca' // Assuming CSV has same headers as requested
        });

    } catch (err) {
        console.error('🔥 Error Global:', err);
    } finally {
        await client.end();
        console.log('\n👋 Proceso finalizado.');
    }
};

main();
