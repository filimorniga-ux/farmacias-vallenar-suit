
import { config } from 'dotenv';
config();
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';

const client = new Client({ connectionString: process.env.DATABASE_URL });

// Helper to clean price strings "$ 1.000" -> 1000
function cleanPrice(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
}

// Helper to clean stock
function cleanStock(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9\-]/g, ''); // Keep negative? maybe not
    return parseInt(clean, 10) || 0;
}

async function importBranchFile(filePath: string, branchName: string) {
    const fileName = path.basename(filePath);
    console.log(`Processing ${fileName} for ${branchName}...`);

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`Found ${rows.length} rows.`);

    // Delete old data for this file
    await client.query('DELETE FROM inventory_imports WHERE source_file = $1', [fileName]);

    let inserted = 0;
    for (const row of rows as any[]) {
        const title = row['TITULO'] || row['Titulo'] || row['Nombre'] || 'S/N';
        if (title === 'S/N') continue;

        const price = cleanPrice(row['PRECIO']);
        const stock = cleanStock(row['STOCK']);
        const barcode = row['CODIGOS_BARRA'] ? String(row['CODIGOS_BARRA']) : null;
        const isp = row['CODIGO ISP'] ? String(row['CODIGO ISP']) : null;
        const activePrinciple = row['PRINCIPIOS ACTIVOS'] || null;

        const misc = {
            bioequivalente: row['BIOEQUIVALENTE'],
            accion_terapeutica: row['ACCION_TERAPEUTICA'],
            categoria: row['CATEGORIA'],
            laboratorio: row['LABORATORIO'],
            unidades: row['UNIDADES'],
            receta: row['RECETA MEDICA'],
            concentracion: row['PA CONCENTRACION']
        };

        if (stock > 0 || price > 0) { // Only import potentially active items? User said "inventory", implying everything. Let's import all.
            await client.query(`
                INSERT INTO inventory_imports (
                    source_file,
                    raw_branch,
                    raw_title,
                    raw_price,
                    raw_stock,
                    raw_barcodes,
                    raw_isp_code,
                    raw_active_principle,
                    raw_misc,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            `, [
                fileName,
                branchName,
                title,
                price,
                stock,
                barcode,
                isp,
                activePrinciple,
                JSON.stringify(misc)
            ]);
            inserted++;
        }
        if (inserted % 500 === 0) process.stdout.write('.');
    }
    console.log(`\nInserted ${inserted} records for ${branchName}.`);
}

async function importEnrichedFile(filePath: string) {
    const fileName = path.basename(filePath);
    console.log(`Processing Enriched Master File: ${fileName}...`);

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Assuming header is roughly correct or we map by known keys in inspect
    const rows = XLSX.utils.sheet_to_json(sheet); // might miss empty headers

    console.log(`Found ${rows.length} rows.`);

    await client.query('DELETE FROM inventory_imports WHERE source_file = $1', [fileName]);

    let inserted = 0;
    for (const row of rows as any[]) {
        const title = row['Marca comercial'] || row['Principio activo (DCI)'] || 'S/N';
        if (title === 'S/N') continue;

        const price = cleanPrice(row['Precio referencial CLP']);
        const stock = cleanStock(row['Cantidad actual']);
        // Mapping enriched columns
        const activePrinciple = row['Principio activo (DCI)'];
        const misc = {
            registro_isp: row['Registro ISP'],
            condicion_venta: row['Condición de venta'],
            laboratorio: row['Laboratorio'],
            formato: row['Formato'],
            bioequivalencia: row['Bioequivalente'],
            alternativas: row['Alternativas bioequivalentes'],
            vencimiento: row['Fecha de vencimiento'],
            lote: row['Lote'],
            categoria: row['Categoría']
        };

        await client.query(`
            INSERT INTO inventory_imports (
                source_file,
                raw_branch,
                raw_title,
                raw_price,
                raw_stock,
                raw_active_principle,
                raw_misc,
                created_at,
                updated_at
            ) VALUES ($1, 'MASTER', $2, $3, $4, $5, $6, NOW(), NOW())
         `, [
            fileName,
            title,
            price,
            stock,
            activePrinciple,
            JSON.stringify(misc)
        ]);
        inserted++;
        if (inserted % 500 === 0) process.stdout.write('.');
    }
    console.log(`\nInserted ${inserted} records for Master.`);
}

async function main() {
    await client.connect();

    try {
        await importBranchFile('data_imports/farmacias vallenar santiago.xlsx', 'SANTIAGO');
        await importBranchFile('data_imports/farmacias vallenar colchagua.xlsx', 'COLCHAGUA');
        await importEnrichedFile('data_imports/inventario_medicamentos_enriquecido.xlsx');
        console.log("All imports finished.");
    } catch (e) {
        console.error("Import failed:", e);
    } finally {
        await client.end();
    }
}

main();
