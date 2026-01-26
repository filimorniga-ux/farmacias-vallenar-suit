import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const INPUT_PATH = path.join(process.cwd(), 'public', 'data', 'isp_oficial.csv');
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'isp-data.json');

async function convert() {
    console.log(`📖 Reading CSV from ${INPUT_PATH}...`);

    if (!fs.existsSync(INPUT_PATH)) {
        console.error('❌ CSV file not found!');
        process.exit(1);
    }

    // Ensure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Read with Latin1 (ISO-8859-1) encoding
    const fileContent = fs.readFileSync(INPUT_PATH, 'latin1');

    console.log('⚙️ Parsing CSV...');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        trim: true,
        relax_column_count: true,
        from_line: 4 // Skip metadata lines
    });

    console.log(`✅ Parsed ${records.length} records.`);

    // Clean keys and values
    const cleanedRecords = records.map((r: any) => {
        return {
            registry: r['Registro']?.trim() || '',
            product: r['Producto']?.trim() || r['Producto ']?.trim() || '',
            active_ingredient: r['Principio Activo']?.trim() || '',
            holder: r['Titular']?.trim() || '',
            status: r['Estado']?.trim() || '',
            usage: r['Uso / Tratamiento']?.trim() || '',
            validity: r['Vigencia']?.trim() || ''
        };
    });

    console.log(`💾 Writing JSON to ${OUTPUT_PATH}...`);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleanedRecords, null, 2), 'utf-8');

    console.log('🚀 Done! JSON created successfully.');
}

convert();
