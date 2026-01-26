
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const ISP_FILE_PATH = path.join(process.cwd(), 'data_imports', 'isp_oficial.csv');

async function testSearch(term: string) {
    console.log(`\n🧪 Testing Search for term: "${term}"`);
    try {
        const fileContent = fs.readFileSync(ISP_FILE_PATH, 'latin1');

        // Emulate Server Action Logic
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            trim: true,
            relax_column_count: true,
            from_line: 4 // Skip metadata
        }) as any[];

        console.log(`   - Total Records: ${records.length}`);
        if (records.length > 0) {
            console.log('   - Headers found:', Object.keys(records[0]));
            console.log('   - First Record:', records[0]);
        }

        const normalizedTerm = term.toLowerCase().trim();
        const filtered = records.filter((record: any) => {
            const producto = String(record['Producto'] || record['Producto '] || '').trim();
            const principio = String(record['Principio Activo'] || '').trim();
            const registro = String(record['Registro'] || '').trim();

            if (!producto && !principio) return false;

            return (
                producto.toLowerCase().includes(normalizedTerm) ||
                principio.toLowerCase().includes(normalizedTerm) ||
                registro.toLowerCase().includes(normalizedTerm)
            );
        });

        console.log(`   - Matches: ${filtered.length}`);
        if (filtered.length > 0) {
            console.log('   - Top 3 matches:');
            filtered.slice(0, 3).forEach((r: any) => console.log(`     * ${r['Producto'] || r['Producto ']} (${r['Principio Activo']})`));
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

(async () => {
    await testSearch('paracetamol');
    await testSearch('A'); // Test single letter filter logic simulation
})();
