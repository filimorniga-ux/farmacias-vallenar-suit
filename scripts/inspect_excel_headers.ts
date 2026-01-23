
import xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Handle potentially different import behavior
const readFile = xlsx.readFile;
const utils = xlsx.utils;

const files = [
    'data_imports/VALLENAR_SUC_1.xlsx',
    'data_imports/VALLENAR_SUC_2.xlsx',
];

files.forEach((file) => {
    const filePath = path.resolve(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        console.log(`\n--- Inspecting ${file} ---`);
        try {
            const workbook = readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data = utils.sheet_to_json(sheet, { header: 1 });

            // Print headers
            console.log('Headers:', data[0]);
            // Print first 3 rows
            console.log('First 3 rows:', data.slice(1, 4));
        } catch (e) {
            console.error("Error reading file:", e);
        }
    } else {
        console.log(`File not found: ${file}`);
    }
});

// Also inspect the master CSV
const csvPath = path.resolve(process.cwd(), 'data_imports/master_inventory_FINAL.csv');
if (fs.existsSync(csvPath)) {
    console.log(`\n--- Inspecting master_inventory_FINAL.csv ---`);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    console.log('Headers:', lines[0]);
    console.log('First 3 rows:');
    lines.slice(1, 4).forEach(line => console.log(line));
}
