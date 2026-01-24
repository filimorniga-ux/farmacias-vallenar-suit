
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const ISP_FILE_PATH = path.join(process.cwd(), 'data_imports', 'isp_oficial.csv');

try {
    console.log('Reading file from:', ISP_FILE_PATH);
    const fileContent = fs.readFileSync(ISP_FILE_PATH, 'latin1');
    console.log('File read successfully. Length:', fileContent.length);

    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        trim: true,
        relax_column_count: true,
        from_line: 4
    });

    console.log('Records parsed:', records.length);
    if (records.length > 0) {
        console.log('First record keys:', Object.keys(records[0] as object));
        console.log('First record sample:', records[0]);
    }

} catch (e) {
    console.error('Error:', e);
}
