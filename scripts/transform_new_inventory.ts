
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const INPUT_CSV = 'data_imports/good master_inventory_FINAL - master_inventory.csv';
const OUTPUT_JSON = 'data_imports/master_inventory.json';

async function transform() {
    console.log('🚀 Starting CSV to JSON Transformation...');

    const csvPath = path.resolve(process.cwd(), INPUT_CSV);
    const jsonPath = path.resolve(process.cwd(), OUTPUT_JSON);

    if (!fs.existsSync(csvPath)) {
        console.error(`❌ Input file not found: ${csvPath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
    });

    console.log(`📦 Parsed ${records.length} records from CSV.`);

    const transformedData = records.map((record: any) => {
        // Map CSV fields to JSON structure
        const barcodes = record['Barcodes']
            ? record['Barcodes'].split(',').map((b: string) => b.trim()).filter((b: string) => b.length > 0)
            : [];

        const activeIngredients = record['ActiveIngredients']
            ? record['ActiveIngredients'].split(',').map((i: string) => i.trim())
            : [];

        // Clean up price (remove non-numeric chars if any, though sample seemed clean)
        const price = parseInt(record['Price']) || 0;
        const stock = parseInt(record['Stock']) || 0;

        // Map Prescription Type
        // If "RECETA", condition is 'R', otherwise 'VD' (Venta Directa)
        let prescriptionType = record['PrescriptionType'] || '';
        let condition = 'VD';
        if (prescriptionType.toUpperCase().includes('RECETA') || prescriptionType.toUpperCase().includes('RETENIDA')) {
            condition = 'R';
        }

        return {
            name: record['Name'],
            sku: record['SKU'] || (barcodes.length > 0 ? barcodes[0] : null), // Fallback SKU
            barcodes: barcodes,
            price: price,
            stock: stock,
            category: record['Category'] || 'OTROS',
            laboratory: record['Laboratory'] || 'SIN ASIGNACION',
            activeIngredients: activeIngredients,
            isBioequivalent: record['Bioequivalent'] === 'true' || record['Bioequivalent'] === 'TRUE',
            description: record['Description'],
            ispCode: record['ISP_Code'],
            therapeuticAction: record['TherapeuticAction'],
            units: record['Units'],
            concentration: record['Concentration'],
            prescriptionType: prescriptionType,
            condition: condition // Mapped value
        };
    });

    // Remove items without name (if any)
    const cleanData = transformedData.filter((item: any) => item.name && item.name.length > 0);

    console.log(`✅ Transformed ${cleanData.length} valid items.`);

    fs.writeFileSync(jsonPath, JSON.stringify(cleanData, null, 2));
    console.log(`💾 Saved to ${jsonPath}`);
}

transform().catch(console.error);
