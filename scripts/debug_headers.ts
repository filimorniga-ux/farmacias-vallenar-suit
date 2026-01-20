
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';

const FILES = [
    'data_imports/Maestro materiales Cenabast a diciembre 2025.xlsx',
    'data/Maestro Materiales Cenabast Octubre 2025 - Listado Productos.csv',
    'data/Base_Datos_App_Vallenar_Final.csv'
];

async function inspect() {
    for (const file of FILES) {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.log(`❌ Missing: ${file}`);
            continue;
        }

        console.log(`\n--- Inspecting: ${path.basename(file)} ---`);
        try {
            if (file.endsWith('.xlsx')) {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(filePath);
                const worksheet = workbook.getWorksheet(1);
                // Print first 5 rows to see structure
                worksheet.eachRow((row, number) => {
                    if (number <= 5) console.log(`Row ${number}:`, JSON.stringify(row.values));
                });
            } else {
                const content = fs.readFileSync(filePath, 'latin1');
                const lines = content.split('\n').slice(0, 5);
                lines.forEach((l, i) => console.log(`Line ${i + 1}:`, l));
            }
        } catch (err) {
            console.error('Error:', err);
        }
    }
}

inspect();
