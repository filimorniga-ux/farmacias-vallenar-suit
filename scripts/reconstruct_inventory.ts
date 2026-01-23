
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
const OUTPUT_CSV = 'data_imports/master_inventory_FINAL.csv';

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

// --- Super-Prompt Logic ---
const cleanBarcodes = (input: any): string[] => {
    if (!input) return [];
    let str = input.toString();

    // Handle Scientific Notation
    if (str.toUpperCase().includes('E+')) {
        try {
            const num = parseFloat(str);
            if (!isNaN(num)) {
                str = num.toLocaleString('fullwide', { useGrouping: false });
            }
        } catch (e) { }
    }

    const candidates = str.split(/[,;|\s]+/).map((s: string) => s.trim());
    const validBarcodes: string[] = [];

    for (const raw of candidates) {
        const clean = raw.replace(/[^a-zA-Z0-9]/g, '');
        if (clean.length >= 7) {
            validBarcodes.push(clean);
        }
    }
    return [...new Set(validBarcodes)];
};

// --- Main ---
async function reconstruct() {
    console.log('🚀 Starting Inventory Reconstruction (With ISP Fuzzy Match)...');
    const masterMap = new Map<string, MasterProduct>();

    // 1. Process Golan CSV (Base)
    console.log(`\n📄 Reading ${SOURCES.GOLAN_CSV}...`);
    try {
        const content = fs.readFileSync(path.resolve(process.cwd(), SOURCES.GOLAN_CSV), 'utf-8');
        const lines = content.split('\n');
        let added = 0;
        lines.slice(1).forEach(line => {
            const cols = line.split(';');
            if (cols.length < 2) return;

            const name = normalize(cols[1]); // Producto
            if (!name) return;

            const barcodes = cleanBarcodes(cols[2]); // Apply Cleaning
            const price = parsePrice(cols[5]);

            if (!masterMap.has(name)) {
                masterMap.set(name, {
                    name,
                    originalName: cols[1].trim(),
                    sku: '',
                    barcodes,
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
                barcodes.forEach(b => {
                    if (!p.barcodes.includes(b)) p.barcodes.push(b);
                });
                if (price > p.price) p.price = price;
            }
        });
        console.log(`   ✅ Loaded ${added} products from Golan CSV.`);
    } catch (e: any) {
        console.error('   ❌ Error reading Golan CSV:', e.message);
    }

    // 2. Process SUC Files
    for (const file of SOURCES.SUC_FILES) {
        console.log(`\n📄 Reading ${file}...`);
        try {
            const fullPath = path.resolve(process.cwd(), file);
            if (!fs.existsSync(fullPath)) {
                console.log('   ⚠️ File not found, skipping.');
                continue;
            }
            const wb = XLSX.readFile(fullPath);
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
                const isp = row['CODIGO ISP'] || '';
                const action = row['ACCION_TERAPEUTICA'] || '';
                const units = row['UNIDADES'] || '';
                const conc = row['PA CONCENTRACION'] || '';
                const recipe = row['RECETA MEDICA'] || '';
                const bio = row['BIOEQUIVALENTE'] || '';

                const barcodes = cleanBarcodes(barcodesRaw);

                if (masterMap.has(name)) {
                    const p = masterMap.get(name)!;
                    if (sku && !p.sku) p.sku = sku;
                    if (cat && !p.category) p.category = cat;
                    if (lab && !p.laboratory) p.laboratory = lab;
                    if (active && p.activeIngredients.length === 0) p.activeIngredients = [active.toString()];
                    if (isp && !p.ispCode) p.ispCode = isp.toString();
                    if (action && !p.therapeuticAction) p.therapeuticAction = action.toString();
                    if (units && !p.units) p.units = units.toString();
                    if (conc && !p.concentration) p.concentration = conc.toString();
                    if (recipe && !p.prescriptionType) p.prescriptionType = recipe.toString();
                    if (bio && normalize(bio.toString()) === 'SI') p.isBioequivalent = true;

                    barcodes.forEach((b: string) => {
                        if (!p.barcodes.includes(b)) p.barcodes.push(b);
                    });
                    if (price > p.price) p.price = price;
                    if (!p.source.includes(path.basename(file))) p.source.push(path.basename(file));
                    enriched++;
                } else {
                    masterMap.set(name, {
                        name,
                        originalName: title.trim(),
                        sku,
                        barcodes,
                        price,
                        stock: 100,
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

    // 3. Process ISP for Bioequivalence (Fuzzy Match)
    console.log(`\n📄 Reading ${SOURCES.ISP_CSV}...`);
    try {
        const ispContent = fs.readFileSync(path.resolve(process.cwd(), SOURCES.ISP_CSV), 'latin1');
        const ispLines = ispContent.split('\n');

        const bioProducts = new Set<string>();
        const bioIngredients = new Set<string>();

        let headerRowIdx = -1;
        let productIdx = -1;
        let activeIdx = -1;
        let estadoIdx = -1;

        // Dynamic Header Search
        for (let i = 0; i < Math.min(20, ispLines.length); i++) {
            const row = ispLines[i].split(';');
            const pIdx = row.findIndex(h => h && h.trim().toLowerCase().includes('producto'));
            const aIdx = row.findIndex(h => h && h.trim().toLowerCase().includes('principio'));
            const eIdx = row.findIndex(h => h && h.trim().toLowerCase().includes('estado'));

            if (pIdx > -1 && eIdx > -1) {
                headerRowIdx = i;
                productIdx = pIdx;
                activeIdx = aIdx;
                estadoIdx = eIdx;
                console.log(`   🐛 Found ISP Headers at line ${i}: Product=${pIdx}, Active=${aIdx}, State=${eIdx}`);
                break;
            }
        }

        if (headerRowIdx !== -1) {
            ispLines.slice(headerRowIdx + 1).forEach(line => {
                const cols = line.split(';');
                if (cols.length <= Math.max(productIdx, estadoIdx)) return;

                const estado = normalize(cols[estadoIdx]);
                if (estado.includes('EQUIVALENTE')) {
                    const productISP = normalize(cols[productIdx]);
                    if (productISP) bioProducts.add(productISP);

                    if (activeIdx > -1) {
                        const activeISP = normalize(cols[activeIdx]);
                        if (activeISP) bioIngredients.add(activeISP);
                    }
                }
            });
        }
        console.log(`   ✅ ISP Loaded: ${bioProducts.size} Bio-Products, ${bioIngredients.size} Bio-Ingredients.`);

        // 4. Cross-Reference Master Inventory
        let bioMatches = 0;
        let activeMatches = 0;

        for (const p of masterMap.values()) {
            if (p.isBioequivalent) continue; // Already marked from SUC

            // Name Match
            if (bioProducts.has(p.name)) {
                p.isBioequivalent = true;
                p.source.push('ISP_MATCH_NAME');
                bioMatches++;
                continue;
            }

            // Active Ingredient Match
            if (p.activeIngredients.length > 0) {
                for (const ing of p.activeIngredients) {
                    const normIng = normalize(ing);
                    if (bioIngredients.has(normIng)) {
                        p.isBioequivalent = true;
                        p.source.push('ISP_MATCH_ACTIVE');
                        activeMatches++;
                        break;
                    }
                }
            }
        }
        console.log(`   ✅ Bioequivalence Matches: Name=${bioMatches}, Ingredient=${activeMatches}`);

    } catch (e: any) {
        console.error('   ❌ Error reading ISP CSV:', e.message);
    }

    // 4. Output
    const products = Array.from(masterMap.values());
    console.log(`\n📊 Final Inventory Count: ${products.length}`);
    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_JSON), JSON.stringify(products, null, 2));
    console.log(`   💾 Saved JSON to ${OUTPUT_JSON}`);

    const csvHeader = 'Name;SKU;Barcodes;Price;Stock;Category;Laboratory;ActiveIngredients;Bioequivalent;Description;ISP_Code;TherapeuticAction;Units;Concentration;PrescriptionType\n';
    const csvRows = products.map(p => {
        return `${p.originalName};${p.sku};${p.barcodes.join(',')};${p.price};${p.stock};${p.category};${p.laboratory};${p.activeIngredients.join('|')};${p.isBioequivalent};${p.description};${p.ispCode};${p.therapeuticAction};${p.units};${p.concentration};${p.prescriptionType}`;
    }).join('\n');
    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_CSV), csvHeader + csvRows);
    console.log(`   💾 Saved CSV to ${OUTPUT_CSV}`);
}

reconstruct();
