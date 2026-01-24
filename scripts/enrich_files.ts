
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { query, closePool } from './db_script'; // Use script-safe DB connection
import { parseProductDetails } from '../src/lib/product-parser'; // Handle path alias manually or use relative

const FILES = [
    'data_imports/master_inventory_FINAL.csv',
    'data_imports/master_inventory.csv',
    'data_imports/good master_inventory_FINAL - master_inventory.csv'
];

async function enrichFiles() {
    console.log('🚀 Starting enrichment of files...');

    for (const fileRelPath of FILES) {
        const filePath = path.join(process.cwd(), fileRelPath);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File not found: ${fileRelPath}`);
            continue;
        }

        console.log(`\n📂 Processing: ${fileRelPath}`);

        try {
            const content = fs.readFileSync(filePath, 'latin1'); // Assuming latin1/iso-8859-1 based on previous file reads

            // Detect delimiter
            const firstLine = content.split('\n')[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';

            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                delimiter: delimiter,
                relax_column_count: true,
                trim: true
            });

            console.log(`   - Records: ${records.length}`);

            let enrichedCount = 0;
            const enrichedRecords = records.map((record: any) => {
                const name = record['Name'] || record['name'] || '';

                // Existing values (parse priority: extract unless existing is good)
                // Actually CSV has empty cols mostly.
                const details = parseProductDetails(name);

                // Update fields if empty
                if (!record['Laboratory'] && details.lab !== 'Generico') {
                    record['Laboratory'] = details.lab;
                }
                if (!record['ActiveIngredients'] && details.dci !== 'Generico') {
                    record['ActiveIngredients'] = details.dci;
                }
                if (!record['Units'] || record['Units'] === '1') {
                    // Check if details.units > 1. 
                    // Some CSVs might expect "X24" string in Units or number?
                    // Based on sample `X5ML`. Let's put format "X{units}" or just number.
                    // DB expects number. CSV header says "Units". Sample had "X5ML".
                    // Let's stick to simple number logic or original string if parsed.
                    if (details.units > 1) record['Units'] = details.units;
                }
                if (!record['TherapeuticAction'] && details.format !== '-') {
                    // Use TherapeuticAction/Description for Format? 
                    // Header says "TherapeuticAction", unlikely "Comprimidos".
                    // Maybe "Description" or "Concentration".
                    if (!record['Concentration'] && details.format) {
                        // Just a guess, put format in Description or similar
                        // Or create new column? User implies updating existing structure.
                        // Let's leave Description/Concentration for now unless obvious.
                    }
                }

                // If JSON file also requested, we can handle it separately.
                enrichedCount++;
                return record;
            });

            const outputPath = filePath.replace('.csv', '_ENRICHED.csv');
            const outputContent = stringify(enrichedRecords, {
                header: true,
                delimiter: delimiter
            });

            fs.writeFileSync(outputPath, outputContent, 'latin1'); // Write back in same encoding
            console.log(`✅ Saved enriched file: ${outputPath}`);

        } catch (e) {
            console.error(`❌ Error processing ${fileRelPath}:`, e);
        }
    }
}

async function enrichDatabase() {
    console.log('\n🚀 Starting DB Enrichment (Products Table)...');

    // 1. Get all products with missing info
    const sqlGet = `SELECT id, name, units_per_box, dci, laboratory, format FROM products`;

    try {
        const res = await query(sqlGet);
        console.log(`   - Total Products in DB: ${res.rows.length}`);

        let updateCount = 0;

        for (const row of res.rows) {
            const details = parseProductDetails(
                row.name,
                row.units_per_box,
                row.dci,
                row.laboratory,
                row.format
            );

            // Check if we have new info to update
            const needsUpdate = (
                (details.units !== (row.units_per_box || 1) && details.units > 1) ||
                (details.dci !== row.dci && details.dci !== 'Generico') ||
                (details.lab !== row.laboratory && details.lab !== 'Generico') ||
                (details.format !== row.format && details.format !== '-')
            );

            if (needsUpdate) {
                // Update DB
                await query(
                    `UPDATE products SET 
                        units_per_box = $1, 
                        dci = COALESCE(dci, $2), 
                        laboratory = COALESCE(laboratory, $3),
                        format = COALESCE(format, $4)
                     WHERE id = $5`,
                    [
                        details.units,
                        details.dci === 'Generico' || details.dci === 'NULL' ? null : details.dci,
                        details.lab === 'Generico' || details.lab === 'NULL' ? null : details.lab,
                        details.format === '-' ? null : details.format,
                        row.id
                    ]
                );
                updateCount++;
                if (updateCount % 100 === 0) process.stdout.write('.');
            }
        }
        console.log(`\n✅ Database updated: ${updateCount} products enriched.`);

    } catch (e) {
        console.error('❌ Error updating DB:', e);
    }
}

// Main execution
(async () => {
    await enrichFiles();
    await enrichDatabase();
    await closePool();
    console.log('🏁 Process completed.');
})();
