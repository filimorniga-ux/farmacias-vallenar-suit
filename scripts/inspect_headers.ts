
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const DATA_DIR = path.join(process.cwd(), 'data_imports');

const files = [
    { name: 'VALLENAR_SUC_1.xlsx', headerRow: 1 }, // 1-based (Excel)
    { name: 'VALLENAR_SUC_2.xlsx', headerRow: 1 },
    { name: 'inventario golan.xlsx', headerRow: 2 },
    { name: 'isp_oficial.csv', headerRow: 4, isCsv: true },
    { name: 'Maestro materiales Cenabast a diciembre 2025.xlsx', headerRow: 1 }
];

async function inspect() {
    for (const file of files) {
        const filePath = path.join(DATA_DIR, file.name);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${file.name}`);
            continue;
        }

        console.log(`\n📄 Inspecting: ${file.name}`);
        if (file.isCsv) {
            const content = fs.readFileSync(filePath, 'latin1'); // ISP usually ANSI/Latin1
            const lines = content.split('\n');
            console.log(`--- Header Row (${file.headerRow}) ---`);
            console.log(lines[file.headerRow - 1]); // 0-indexed access
        } else {
            const workbook = new ExcelJS.Workbook();
            try {
                await workbook.xlsx.readFile(filePath);
                const worksheet = workbook.getWorksheet(1); // First sheet
                if (!worksheet) {
                    console.error('No worksheet found');
                    continue;
                }

                const row = worksheet.getRow(file.headerRow);
                console.log(`--- Header Row (${file.headerRow}) ---`);
                console.log(JSON.stringify(row.values));

                const nextRow = worksheet.getRow(file.headerRow + 1);
                console.log(`--- Sample Data Row (${file.headerRow + 1}) ---`);
                console.log(JSON.stringify(nextRow.values));

            } catch (err) {
                console.error('Error reading excel:', err);
            }
        }
    }
}

inspect();
