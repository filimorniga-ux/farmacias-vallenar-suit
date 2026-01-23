
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// --- Types ---
interface MasterProduct {
    name: string;             // TITULO / Producto (Normalized)
    originalName: string;     // Display Name
    sku: string;
    barcodes: string[];       // CODIGOS_BARRA + Código Barras
    price: number;
    stock: number;            // Fixed 100
    category: string;
    laboratory: string;
    activeIngredients: string[];
    isBioequivalent: boolean;
    description: string;
    source: string[];

    // New Fields
    ispCode: string;
    therapeuticAction: string;
    units: string;
    concentration: string;
    prescriptionType: string;
}

// --- Config ---
const SOURCES = {
    GOLAN_CSV: 'data_imports/golan.csv',
    SUC_FILES: [
        'data_imports/inventario golan.xlsx',
        'data_imports/VALLENAR_SUC_1.xlsx',
        'data_imports/VALLENAR_SUC_2.xlsx',
        'data_imports/farmacias vallenar colchagua.xlsx',
        'data_imports/farmacias vallenar santiago.xlsx'
    ],
    ISP_CSV: 'data_imports/isp_oficial.csv'
};

const OUTPUT_JSON = 'data_imports/master_inventory.json';
const OUTPUT_CSV = 'data_imports/master_inventory.csv';

// --- Helpers ---
const normalize = (str: string) => {
    if (!str) return '';
    return str.toString().trim().toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,]/g, '');
};

const parsePrice = (val: any) => {
    if (!val) return 0;
    const num = parseInt(val.toString().replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
};

// --- Main ---
async function reconstruct() {
    console.log('🚀 Starting Inventory Reconstruction...');
    const masterMap = new Map<string, MasterProduct>();

    // 1. Process Golan CSV (Base)
    console.log(`\n📄 Reading ${SOURCES.GOLAN_CSV}...`);
    try {
        const content = fs.readFileSync(path.resolve(process.cwd(), SOURCES.GOLAN_CSV), 'utf-8');
        const lines = content.split('\n');
        // Header: Grupo de Producto;Producto;Código Barras;Stock;Costo Neto Prom. Unitario;Precio Venta
        let added = 0;
        lines.slice(1).forEach(line => {
            const cols = line.split(';');
            if (cols.length < 2) return;

            const name = normalize(cols[1]); // Producto
            if (!name) return;

            const barcode = cols[2]?.trim();
            const price = parsePrice(cols[5]);

            if (!masterMap.has(name)) {
                masterMap.set(name, {
                    name,
                    originalName: cols[1].trim(),
                    sku: '',
                    barcodes: barcode ? [barcode] : [],
                    price,
                    stock: 100, // Fixed
                    category: normalize(cols[0]), // Grupo
                    laboratory: '',
                    activeIngredients: [],
                    isBioequivalent: false,
                    description: '',
                    source: ['GOLAN_CSV'],
                    ispCode: '',
                    therapeuticAction: '',
                    units: '',
                    concentration: '',
                    prescriptionType: ''
                });
                added++;
            } else {
                const p = masterMap.get(name)!;
                if (barcode && !p.barcodes.includes(barcode)) p.barcodes.push(barcode);
                if (price > p.price) p.price = price;
            }
        });
        console.log(`   ✅ Loaded ${added} products from Golan CSV.`);
    } catch (e: any) {
        console.error('   ❌ Error reading Golan CSV:', e.message);
    }

    // 2. Process SUC Files (Enrichment + Union)
    // Headers: SUCURSAL, SKU, TITULO, CATEGORIA, LABORATORIO, ACCION_TERAPEUTICA, PRINCIPIOS ACTIVOS, STOCK, PRECIO, BIOEQUIVALENTE, CODIGO ISP, UNIDADES, PA CONCENTRACION, RECETA MEDICA, CODIGOS_BARRA
    for (const file of SOURCES.SUC_FILES) {
        console.log(`\n📄 Reading ${file}...`);
        try {
            const fullPath = path.resolve(process.cwd(), file);
            if (!fs.existsSync(fullPath)) {
                console.log('   ⚠️ File not found, skipping.');
                continue;
            }
            const wb = XLSX.readFile(fullPath);
            console.log(`   🐛 Sheets in ${path.basename(file)}:`, wb.SheetNames);
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            let enriched = 0;
            let newItems = 0;

            rows.forEach(row => {
                const title = row['TITULO'] || row['PRODUCTO'] || row['Producto'] || row['Descripción'] || row['DESCRIPCION'];
                if (!title) return;

                const name = normalize(title);
                const sku = row['SKU']?.toString() || '';
                const cat = row['CATEGORIA'] || '';
                const lab = row['LABORATORIO'] || '';
                const active = row['PRINCIPIOS ACTIVOS'] || '';
                const barcodesRaw = row['CODIGOS_BARRA'] || row['CODIGO BARRAS'];
                const price = parsePrice(row['PRECIO']);

                // New Fields
                const isp = row['CODIGO ISP'] || '';
                const action = row['ACCION_TERAPEUTICA'] || '';
                const units = row['UNIDADES'] || '';
                const conc = row['PA CONCENTRACION'] || '';
                const recipe = row['RECETA MEDICA'] || '';
                const bio = row['BIOEQUIVALENTE'] || '';

                const barcodes = barcodesRaw ? barcodesRaw.toString().split(',').map((b: string) => b.trim()).filter((b: string) => b) : [];

                if (masterMap.has(name)) {
                    // Enrich
                    const p = masterMap.get(name)!;
                    if (sku && !p.sku) p.sku = sku;
                    if (cat && !p.category) p.category = cat;
                    if (lab && !p.laboratory) p.laboratory = lab;
                    if (active && p.activeIngredients.length === 0) p.activeIngredients = [active.toString()];

                    // Enrich New Fields if missing
                    if (isp && !p.ispCode) p.ispCode = isp.toString();
                    if (action && !p.therapeuticAction) p.therapeuticAction = action.toString();
                    if (units && !p.units) p.units = units.toString();
                    if (conc && !p.concentration) p.concentration = conc.toString();
                    if (recipe && !p.prescriptionType) p.prescriptionType = recipe.toString();

                    // Logic: If BIOEQUIVALENTE says "SI", use it. (Override ISP matches? Maybe yes, safer)
                    if (bio && normalize(bio.toString()) === 'SI') p.isBioequivalent = true;

                    barcodes.forEach((b: string) => {
                        if (!p.barcodes.includes(b)) p.barcodes.push(b);
                    });

                    if (price > p.price) p.price = price;

                    if (!p.source.includes(path.basename(file))) p.source.push(path.basename(file));
                    enriched++;
                } else {
                    // Add new
                    masterMap.set(name, {
                        name,
                        originalName: title.trim(),
                        sku,
                        barcodes,
                        price,
                        stock: 100, // Fixed
                        category: cat,
                        laboratory: lab,
                        activeIngredients: active ? [active.toString()] : [],
                        isBioequivalent: bio && normalize(bio.toString()) === 'SI',
                        description: action || row['ACCION_TERAPEUTICA'] || '',
                        source: [path.basename(file)],
                        ispCode: isp ? isp.toString() : '',
                        therapeuticAction: action ? action.toString() : '',
                        units: units ? units.toString() : '',
                        concentration: conc ? conc.toString() : '',
                        prescriptionType: recipe ? recipe.toString() : ''
                    });
                    newItems++;
                }
            });
            console.log(`   ✅ Processed: ${enriched} enriched, ${newItems} new.`);
        } catch (e: any) {
            console.error(`   ❌ Error reading ${file}:`, e.message);
        }
    }

    // 3. Process ISP for Bioequivalence
    console.log(`\n📄 Reading ${SOURCES.ISP_CSV}...`);
    try {
        const ispContent = fs.readFileSync(path.resolve(process.cwd(), SOURCES.ISP_CSV), 'latin1');

        const ispLines = ispContent.split('\n');
        let bioMatches = 0;
        let headerRowIdx = -1;
        let productIdx = -1;
        let estadoIdx = -1;

        // Dynamic Header Search
        for (let i = 0; i < ispLines.length; i++) {
            const row = ispLines[i].split(';');
            const pIdx = row.findIndex(h => h && h.trim().toLowerCase().includes('producto'));
            const eIdx = row.findIndex(h => h && h.trim().toLowerCase().includes('estado'));
            if (pIdx > -1 && eIdx > -1) {
                headerRowIdx = i;
                productIdx = pIdx;
                estadoIdx = eIdx;
                console.log(`   🐛 Found ISP Headers at line ${i}: Product=${pIdx}, State=${eIdx}`);
                break;
            }
        }

        if (headerRowIdx !== -1) {
            ispLines.slice(headerRowIdx + 1).forEach(line => {
                const cols = line.split(';');
                if (cols.length <= Math.max(productIdx, estadoIdx)) return;

                const productISP = normalize(cols[productIdx]);
                const estado = normalize(cols[estadoIdx]);

                if (estado.includes('EQUIVALENTE')) {
                    if (masterMap.has(productISP)) {
                        masterMap.get(productISP)!.isBioequivalent = true;
                        bioMatches++;
                    }
                }
            });
        }
        console.log(`   ✅ Bioequivalence matched: ${bioMatches} products.`);
    } catch (e: any) {
        console.error('   ❌ Error reading ISP CSV:', e.message);
    }

    // 4. Output
    const products = Array.from(masterMap.values());
    console.log(`\n📊 Final Inventory Count: ${products.length}`);

    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_JSON), JSON.stringify(products, null, 2));
    console.log(`   💾 Saved JSON to ${OUTPUT_JSON}`);

    // CSV Output
    const csvHeader = 'Name;SKU;Barcodes;Price;Stock;Category;Laboratory;ActiveIngredients;Bioequivalent;Description;ISP_Code;TherapeuticAction;Units;Concentration;PrescriptionType\n';
    const csvRows = products.map(p => {
        return `${p.originalName};${p.sku};${p.barcodes.join(',')};${p.price};${p.stock};${p.category};${p.laboratory};${p.activeIngredients.join('|')};${p.isBioequivalent};${p.description};${p.ispCode};${p.therapeuticAction};${p.units};${p.concentration};${p.prescriptionType}`;
    }).join('\n');

    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_CSV), csvHeader + csvRows);
    console.log(`   💾 Saved CSV to ${OUTPUT_CSV}`);
}

reconstruct();
