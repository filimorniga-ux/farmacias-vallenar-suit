
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';

// --- Configuration ---
const PREVIEW_LIMIT = 0; // 0 = Process all
const THRESHOLD_FUZZY = 0.95;
const DATA_DIR = path.join(process.cwd(), 'data_imports');
const OUTPUT_JSON = path.join(process.cwd(), 'Inventario_Maestro_Unificado_v1.json');
const OUTPUT_CSV = path.join(process.cwd(), 'conflictos_para_revision.csv');

// --- Types ---
interface InventoryItem {
    sucursal: string;
    stock: number;
    precio?: number;
    costo?: number;
}

interface MasterProduct {
    master_sku: string;
    nombre_comercial: string;
    nombre_generico_cenabast?: string;
    codigos_barra: string[];
    laboratorio?: string;
    formato_original?: string;

    // Clinical
    registro_isp?: string;
    principio_activo?: string;
    es_bioequivalente: boolean;
    uso_terapeutico?: string;

    // Logistics
    inventario: InventoryItem[];
    stock_total: number;

    // Metadata
    flags: string[];
    fuente_origen: string[];
    match_score?: number;
}

// --- Helpers ---

// Levenshtein Similarity (0.0 to 1.0)
function getSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function editDistance(s1: string, s2: string): number {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function normalizeName(name: string): string {
    if (!name) return '';
    let clean = name.trim().toUpperCase();
    // Remove common prefixes/suffixes for better matching
    clean = clean.replace(/^(CJA|BT|COM|REC|FUE|FCO|AMPOLLA|GRAGEA|JARABE)\s+/g, '');
    clean = clean.replace(/[^A-Z0-9\s]/g, ''); // Remove special chars
    clean = clean.replace(/\s+/g, ' '); // Collapse spaces
    return clean;
}

function cleanBarcodes(raw: any): string[] {
    if (!raw) return [];

    // Handle Excel formula object from cell { formula: '"123"', result: '123' }
    if (typeof raw === 'object' && raw.result) {
        raw = raw.result;
    }

    const str = String(raw).trim();
    if (str === '') return [];

    // Split by comma, hyphens not standard but maybe used
    // User said: "7801, 7802"
    const parts = str.split(/[,;]/).map(s => s.trim().replace(/[^0-9]/g, ''));
    return parts.filter(p => p.length > 3); // Filter partials
}

// --- Main Process ---
async function main() {
    console.log('🚀 Iniciando Fusión de Inventario Maestro (Optimizado)...');

    // 1. Load Data
    const vallenar1 = await loadExcel('VALLENAR_SUC_1.xlsx', 1, 'Vallenar SUC 1');
    const vallenar2 = await loadExcel('VALLENAR_SUC_2.xlsx', 1, 'Vallenar SUC 2');
    const golan = await loadExcel('inventario golan.xlsx', 2, 'Golan');
    const cenabast = await loadExcel('Maestro materiales Cenabast a diciembre 2025.xlsx', 1, 'Cenabast');
    const isp = loadCSV('isp_oficial.csv', 4);

    console.log(`📦 Datos Cargados:
    - Vallenar 1: ${vallenar1.length}
    - Vallenar 2: ${vallenar2.length}
    - Golan: ${golan.length}
    - Cenabast: ${cenabast.length}
    - ISP: ${isp.length}
    `);

    // 2. Initialize Master Map (Key: SKU or Generated ID)
    const masterMap = new Map<string, MasterProduct>();
    const barcodeMap = new Map<string, string>(); // Barcode -> MasterSKU

    // 3. Process Vallenar (Source of Truth for Identity)
    // Merge SUC 1 & 2
    const allVallenar = [...vallenar1, ...vallenar2];

    for (const row of allVallenar) {
        const rowSKU = String(row['SKU']).trim();
        const barcodes = cleanBarcodes(row['CODIGOS_BARRA']);
        const name = row['TITULO'] || '';
        const normName = normalizeName(name);
        const stock = Number(row['STOCK']) || 0;
        const price = Number(row['PRECIO']) || 0;
        const sucursal = row['_SOURCE'] || 'Vallenar';
        const lab = row['LABORATORIO'] || '';

        let product = masterMap.get(rowSKU);

        if (!product) {
            product = {
                master_sku: rowSKU,
                nombre_comercial: name,
                codigos_barra: barcodes,
                laboratorio: lab,
                formato_original: name,
                inventario: [],
                stock_total: 0,
                flags: [],
                fuente_origen: ['vallenar'],
                es_bioequivalente: false
            };
            masterMap.set(rowSKU, product);

            // Map barcodes
            barcodes.forEach(b => barcodeMap.set(b, rowSKU));
        }

        // Add Inventory
        product.inventario.push({
            sucursal: sucursal,
            stock: stock,
            precio: price
        });
        product.stock_total += stock;
    }

    // 3b. Build Search Index (Optimization)
    // Bucket by first 3 chars of normalized name
    const searchIndex = new Map<string, MasterProduct[]>();
    for (const prod of masterMap.values()) {
        const key = normalizeName(prod.nombre_comercial).substring(0, 3);
        if (key.length >= 3) {
            if (!searchIndex.has(key)) searchIndex.set(key, []);
            searchIndex.get(key)!.push(prod);
        }
    }

    // 4. Fusion Golan (External Inventory)
    // Strategy: Match by Barcode first, then Fuzzy Name
    const conflicts: any[] = [];
    const searchKeysChecked = new Set<string>();

    for (const row of golan) {
        const barcodes = cleanBarcodes(row['Código Barras']);
        const rawName = row['Producto'] || '';
        const normName = normalizeName(rawName);
        const stock = Number(row['Stock']) || 0;
        const cost = Number(row['Costo Neto Prom. Unitario']) || 0;
        const sucursal = 'Bodega Golan';

        let matchSKU: string | undefined;

        // A. Exact Barcode Match
        for (const b of barcodes) {
            if (barcodeMap.has(b)) {
                matchSKU = barcodeMap.get(b);
                break;
            }
        }

        // B. Fuzzy Name Match
        if (!matchSKU && normName.length > 5) {
            let bestScore = 0;
            let bestCandidate: string | undefined;

            const searchKey = normName.substring(0, 3);
            const candidates = searchIndex.get(searchKey) || [];

            for (const prod of candidates) {
                const similarity = getSimilarity(normName, normalizeName(prod.nombre_comercial));
                if (similarity > bestScore) {
                    bestScore = similarity;
                    bestCandidate = prod.master_sku;
                }
            }

            if (bestScore >= THRESHOLD_FUZZY) {
                matchSKU = bestCandidate;
                if (!searchKeysChecked.has(matchSKU!)) {
                    console.log(`✨ Fuzzy Match: ${rawName} <-> ${masterMap.get(matchSKU!)?.nombre_comercial} (${(bestScore * 100).toFixed(1)}%)`);
                    searchKeysChecked.add(matchSKU!);
                }
            }
        }

        if (matchSKU) {
            const product = masterMap.get(matchSKU)!;
            product.inventario.push({ sucursal, stock, costo: cost });
            product.stock_total += stock;
            product.fuente_origen.push('golan');

            // Merge barcodes
            barcodes.forEach(b => {
                if (!product.codigos_barra.includes(b)) product.codigos_barra.push(b);
            });
        } else {
            // Orphan Logic
            if (stock > 0) {
                const newSKU = `GOL-${Math.floor(Math.random() * 1000000)}`;
                const newProd: MasterProduct = {
                    master_sku: newSKU,
                    nombre_comercial: rawName,
                    codigos_barra: barcodes,
                    inventario: [{ sucursal, stock, costo: cost }],
                    stock_total: stock,
                    flags: ['revisar_manual', 'origen_externo'],
                    fuente_origen: ['golan'],
                    es_bioequivalente: false
                };
                masterMap.set(newSKU, newProd);

                // Update index
                const key = normalizeName(rawName).substring(0, 3);
                if (key.length >= 3) {
                    if (!searchIndex.has(key)) searchIndex.set(key, []);
                    searchIndex.get(key)!.push(newProd);
                }

                conflicts.push({ type: 'Nuevo Producto (Golan)', sku: newSKU, name: rawName, reason: 'Sin match auto' });
            } else {
                conflicts.push({ type: 'Ignorado (Sin Stock)', sku: 'N/A', name: rawName, reason: 'Stock 0' });
            }
        }
    }

    // 5. Enrich with ISP (Clinical Data)
    console.log('💊 Enriqueciendo con ISP...');

    // ISP Indexing
    const ispIndex = new Map<string, any[]>();
    for (const row of isp) {
        const name = normalizeName(row['Producto']);
        const key = name.substring(0, 3);
        if (key.length >= 3) {
            if (!ispIndex.has(key)) ispIndex.set(key, []);
            ispIndex.get(key)!.push(row);
        }
    }

    // Convert Map to Array for iteration
    const products = Array.from(masterMap.values());

    for (const prod of products) {
        const normProd = normalizeName(prod.nombre_comercial);

        // Fuzzy Search in ISP
        let bestScore = 0;
        let bestISP: any = null;

        const key = normProd.substring(0, 3);
        const candidates = ispIndex.get(key) || [];

        for (const ispRow of candidates) {
            const ispName = ispRow['Producto'] || '';
            const score = getSimilarity(normProd, normalizeName(ispName));
            if (score > bestScore) {
                bestScore = score;
                bestISP = ispRow;
            }
        }

        if (bestScore > 0.90 && bestISP) {
            prod.registro_isp = bestISP['Registro'] || prod.registro_isp;
            prod.principio_activo = bestISP['Principio Activo'];
            prod.uso_terapeutico = bestISP['Uso / Tratamiento'];
            prod.es_bioequivalente = String(bestISP['Estado']).includes('EQUIVALENTE');
            if (!prod.fuente_origen.includes('isp_oficial')) prod.fuente_origen.push('isp_oficial');
            prod.match_score = bestScore;
        } else {
            if (prod.stock_total > 0) {
                prod.flags.push('sin_match_isp');
                // conflicts.push({ type: 'Sin Match ISP', sku: prod.master_sku, name: prod.nombre_comercial, reason: 'No encontrado en ISP' });
            }
        }
    }

    // 7. Safety Rails & Price Alerts
    for (const prod of products) {
        const prices = prod.inventario.map(i => i.precio).filter(p => p && p > 0) as number[];
        if (prices.length > 1) {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            if (max > min * 1.5) {
                const msg = `error_precio_posible (Var ${(max / min * 100 - 100).toFixed(0)}%)`;
                prod.flags.push(msg);
                conflicts.push({ type: 'Alerta Precio', sku: prod.master_sku, name: prod.nombre_comercial, reason: msg });
            }
        }

        if (prod.flags.includes('revisar_manual')) {
            // Already added to conflicts when created
        }
    }

    // 8. Output JSON
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(products, null, 2));
    console.log(`✅ Archivo Maestro Generado: ${OUTPUT_JSON} (${products.length} productos)`);

    // 9. Output CSV
    const csvHeader = 'Tipo,SKU,Nombre,Razon\n';
    const csvRows = conflicts.map(c =>
        `"${c.type}","${c.sku || ''}","${String(c.name).replace(/"/g, '""')}","${c.reason || ''}"`
    ).join('\n');

    fs.writeFileSync(OUTPUT_CSV, csvHeader + csvRows, { encoding: 'latin1' });
    console.log(`⚠️ Reporte de Conflictos: ${OUTPUT_CSV} (${conflicts.length} casos)`);
}

// loaders
async function loadExcel(filename: string, headerRow: number, sourceName: string) {
    const p = path.join(DATA_DIR, filename);
    if (!fs.existsSync(p)) return [];

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(p);
    const ws = wb.getWorksheet(1);
    if (!ws) return [];

    const rows: any[] = [];
    const headers = (ws.getRow(headerRow).values as any[]).map(h => String(h).trim());

    ws.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRow) return;
        const obj: any = { _SOURCE: sourceName };
        row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
                // Handle formula values
                let val = cell.value;
                if (typeof val === 'object' && val && 'result' in val) {
                    val = (val as any).result;
                }
                obj[header] = val;
            }
        });
        rows.push(obj);
    });
    return rows;
}

function loadCSV(filename: string, headerRow: number) {
    const p = path.join(DATA_DIR, filename);
    if (!fs.existsSync(p)) return [];
    const content = fs.readFileSync(p, 'latin1');
    return parse(content, {
        delimiter: ';',
        columns: true, // Use first line as header? No, header is row 4
        from_line: headerRow,
        skip_empty_lines: true,
        relax_column_count: true
    });
}

main().catch(console.error);
