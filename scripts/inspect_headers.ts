
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import * as fs from 'fs';
import * as path from 'path';

const files = [
    'data_imports/inventario golan.xlsx',
    'data_imports/VALLENAR_SUC_1.xlsx',
    'data_imports/VALLENAR_SUC_2.xlsx',
    'data_imports/farmacias vallenar colchagua.xlsx',
    'data_imports/farmacias vallenar santiago.xlsx'
];

files.forEach(file => {
    try {
        const fullPath = path.resolve(process.cwd(), file);
        if (fs.existsSync(fullPath)) {
            const workbook = XLSX.readFile(fullPath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
            console.log(`\nFile: ${file}`);
            console.log('Headers:', headers);
            // Show first row of data
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[1];
            console.log('Row 1:', data);
        } else {
            console.log(`\nFile not found: ${file}`);
        }
    } catch (e: any) {
        console.error(`Error reading ${file}:`, e.message);
    }
});
