
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const GOLAN_FILE = 'data_imports/golan.csv';
const MASTER_FILE = 'data_imports/master_inventory.json';

const normalize = (str: string) => {
    if (!str) return '';
    return str.toString().trim().toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,]/g, '');
};

async function verify() {
    console.log('🔍 Verifying Golan Barcodes...');

    // Load Master
    const masterData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), MASTER_FILE), 'utf-8'));
    const masterMap = new Map();
    masterData.forEach((p: any) => masterMap.set(p.name, p));

    // Read Golan
    const content = fs.readFileSync(path.resolve(process.cwd(), GOLAN_FILE), 'utf-8');
    const lines = content.split('\n').slice(1);

    let totalGolan = 0;
    let foundInMaster = 0;
    let barcodeMismatch = 0;
    let missingBarcodeInMaster = 0;

    for (const line of lines) {
        const cols = line.split(';');
        if (cols.length < 2) continue;

        const rawName = cols[1];
        const rawBarcode = cols[2]?.trim();
        if (!rawName) continue;

        totalGolan++;
        const name = normalize(rawName);
        const masterItem = masterMap.get(name);

        if (masterItem) {
            foundInMaster++;
            // Check if master has the barcode
            if (rawBarcode) {
                if (!masterItem.barcodes || masterItem.barcodes.length === 0) {
                    missingBarcodeInMaster++;
                    console.log(`⚠️  Missing Barcode: ${name} (Golan: ${rawBarcode})`);
                } else if (!masterItem.barcodes.includes(rawBarcode)) {
                    barcodeMismatch++;
                    console.log(`❌ Barcode Mismatch: ${name} (Golan: ${rawBarcode}, Master: ${masterItem.barcodes.join(',')})`);
                }
            }
        } else {
            // console.log(`❓ Product Not Found in Master (Name Mismatch?): ${name}`);
        }
    }

    console.log('\n📊 Results:');
    console.log(`   Total Golan Rows: ${totalGolan}`);
    console.log(`   Matched in Master: ${foundInMaster}`);
    console.log(`   Missing Barcodes in Master: ${missingBarcodeInMaster}`);
    console.log(`   Barcode Mismatches (Golan has one, Master has different list): ${barcodeMismatch}`);
}

verify();
