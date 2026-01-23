
import xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Handle potentially different import behavior
const readFile = xlsx.readFile;
const utils = xlsx.utils;

const EXCEL_FILES = [
    'data_imports/VALLENAR_SUC_1.xlsx',
    'data_imports/VALLENAR_SUC_2.xlsx',
];
const CSV_FILE = 'data_imports/master_inventory_FINAL.csv';
const OUTPUT_CSV = 'data_imports/master_inventory_FINAL.csv'; // Overwrite
const JSON_OUTPUT = 'data_imports/master_inventory.json';

function normalizeName(name: string): string {
    return name?.trim().toUpperCase() || '';
}

function parseBarcodes(barcodeStr: string | number): string[] {
    if (!barcodeStr) return [];
    return String(barcodeStr)
        .split(/[,\s]+/) // Split by comma or whitespace
        .map(b => b.trim())
        .filter(b => b.length > 0 && b !== 'NO' && b !== 'N/A');
}

async function main() {
    console.log("Loading Excel files...");
    const excelProducts = new Map<string, Set<string>>();

    for (const file of EXCEL_FILES) {
        const filePath = path.resolve(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${file}`);
            continue;
        }
        try {
            const workbook = readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = utils.sheet_to_json(sheet) as any[];

            console.log(`Loaded ${data.length} rows from ${file}`);

            for (const row of data) {
                // Use keys found in inspection: TITULO and CODIGOS_BARRA
                const name = normalizeName(row['TITULO'] || row['Nombre']);
                const barcodeRaw = row['CODIGOS_BARRA'] || row['Codigo de Barra'];

                if (name && barcodeRaw) {
                    const barcodes = parseBarcodes(barcodeRaw);
                    if (barcodes.length > 0) {
                        if (!excelProducts.has(name)) {
                            excelProducts.set(name, new Set());
                        }
                        barcodes.forEach(b => excelProducts.get(name)?.add(b));
                    }
                }
            }
        } catch (err) {
            console.error(`Error reading ${file}:`, err);
        }
    }

    console.log(`Found barcodes for ${excelProducts.size} unique products in Excel files.`);

    if (excelProducts.size === 0) {
        console.warn("No products found in Excel! Aborting CSV update.");
        return;
    }

    console.log("Loading Master CSV...");
    const csvPath = path.resolve(process.cwd(), CSV_FILE);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(';');

    // Map headers to indices
    const hMap: Record<string, number> = {};
    headers.forEach((h, i) => hMap[h.trim()] = i);

    const updatedLines: string[] = [lines[0]]; // Keep header
    const jsonOutputData: any[] = [];

    let updatedCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(';');

        const nameIdx = hMap['Name'];
        const barcodeIdx = hMap['Barcodes'];

        if (nameIdx === undefined || barcodeIdx === undefined) {
            console.error("Critical: Name or Barcodes column missing");
            break;
        }

        const name = cols[nameIdx];
        const currentBarcodesStr = cols[barcodeIdx] || '';
        const currentBarcodes = new Set(parseBarcodes(currentBarcodesStr));

        const normalizedName = normalizeName(name);

        // Check for match in Excel data
        if (excelProducts.has(normalizedName)) {
            const newBarcodes = excelProducts.get(normalizedName);
            let added = false;
            newBarcodes?.forEach(b => {
                if (!currentBarcodes.has(b)) {
                    currentBarcodes.add(b);
                    added = true;
                }
            });
            if (added) updatedCount++;
        }

        // Update the column
        cols[barcodeIdx] = Array.from(currentBarcodes).join(',');

        updatedLines.push(cols.join(';'));

        // Prepare JSON object
        jsonOutputData.push({
            name: cols[hMap['Name']],
            sku: cols[hMap['SKU']],
            barcodes: Array.from(currentBarcodes),
            price: parseInt(cols[hMap['Price']] || '0'),
            category: cols[hMap['Category']],
            laboratory: cols[hMap['Laboratory']],
            activeIngredients: cols[hMap['ActiveIngredients']] ? cols[hMap['ActiveIngredients']].split(',') : [],
            isBioequivalent: cols[hMap['Bioequivalent']] === 'true',
            prescriptionType: cols[hMap['PrescriptionType']],
            stock: parseInt(cols[hMap['Stock']] || '0'),
            ispCode: cols[hMap['ISP_Code']],
            therapeuticAction: cols[hMap['TherapeuticAction']],
            units: cols[hMap['Units']],
            concentration: cols[hMap['Concentration']]
        });
    }

    console.log(`Updated barcodes for ${updatedCount} products.`);

    // Write CSV
    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_CSV), updatedLines.join('\n'));
    console.log(`Saved updated CSV to ${OUTPUT_CSV}`);

    // Write JSON
    fs.writeFileSync(path.resolve(process.cwd(), JSON_OUTPUT), JSON.stringify(jsonOutputData, null, 2));
    console.log(`Saved updated JSON to ${JSON_OUTPUT}`);
}

main().catch(console.error);
