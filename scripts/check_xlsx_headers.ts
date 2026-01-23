
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FILES = [
    'data_imports/inventario golan.xlsx',
    'data_imports/VALLENAR_SUC_1.xlsx',
    'data_imports/VALLENAR_SUC_2.xlsx'
];

function checkHeaders() {
    console.log('🔍 Inspecting XLSX Headers...');
    for (const file of FILES) {
        try {
            const fullPath = path.resolve(process.cwd(), file);
            if (!fs.existsSync(fullPath)) {
                console.log(`❌ File not found: ${file}`);
                continue;
            }
            const wb = XLSX.readFile(fullPath);
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (json.length > 0) {
                console.log(`\n📄 ${path.basename(file)} Headers:`);
                console.log(json[0].join(' | ')); // Print first row (headers)
            }
        } catch (e) {
            console.error(`Error reading ${file}:`, e);
        }
    }
}

checkHeaders();
