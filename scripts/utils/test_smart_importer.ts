
import path from 'path';
import fs from 'fs';
import { SmartImporter } from './src/lib/importer/SmartImporter';

const DATA_DIR = path.join(process.cwd(), 'data_imports');
const TEST_FILES = [
    'inventario golan.xlsx',
    'VALLENAR_SUC_1.xlsx',
    'isp_oficial.csv'
];

async function run() {
    const importer = new SmartImporter();

    for (const file of TEST_FILES) {
        const filePath = path.join(DATA_DIR, file);
        if (!fs.existsSync(filePath)) {
            console.log(`❌ Skipped (Not found): ${file}`);
            continue;
        }

        console.log(`\n-----------------------------------`);
        console.log(`📂 Processing: ${file}`);

        try {
            const result = await importer.importFile(filePath);
            console.log(`🎉 Success!`);
            console.log(`   Type: ${result.metadata.sourceType}`);
            console.log(`   Processed: ${result.metadata.totalProcessed}`);
            console.log(`   Unified Products: ${result.products.length}`);

            // Sample
            if (result.products.length > 0) {
                console.log(`   Sample Product:`);
                console.log(JSON.stringify(result.products[0], null, 2));
            }
        } catch (err: any) {
            console.error(`❌ Error: ${err.message}`);
        }
    }
}

run().catch(console.error);
