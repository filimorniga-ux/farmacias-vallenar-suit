import ExcelJS from 'exceljs';

interface ExportOptions {
    title: string;
    subtitle?: string;
    sheetName?: string;
    creator?: string;
    locationName?: string;
    columns: { header: string; key: string; width?: number; style?: Partial<ExcelJS.Style> }[];
    data: any[];
}

export class ExcelService {
    async generateReport(options: ExportOptions): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = options.creator || 'Farmacias Vallenar Suit';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(options.sheetName || 'Reporte');

        // --- STYLES ---
        const headerStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0052CC' } }, // Corporate Blue
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            }
        };

        const titleStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, size: 16, color: { argb: 'FF1F2937' } }, // Slate 800
        };

        const metaStyle: Partial<ExcelJS.Style> = {
            font: { italic: true, size: 10, color: { argb: 'FF6B7280' } } // Slate 500
        };

        // --- TITLE SECTION ---
        sheet.mergeCells('A1:E1'); // Assuming at least 5 cols
        const titleCell = sheet.getCell('A1');
        titleCell.value = options.title.toUpperCase();
        titleCell.style = titleStyle;

        // Subtitle / Context
        if (options.subtitle) {
            sheet.mergeCells('A2:E2');
            sheet.getCell('A2').value = options.subtitle;
        }

        // Metadata Row (Date, User, Location)
        const rowStart = options.subtitle ? 4 : 3;

        const dateStr = new Date().toLocaleString('es-CL');
        sheet.mergeCells(`A${rowStart}:C${rowStart}`);
        sheet.getCell(`A${rowStart}`).value = `Generado el: ${dateStr} | Por: ${options.creator || 'Sistema'} | Sucursal: ${options.locationName || 'General'}`;
        sheet.getCell(`A${rowStart}`).style = metaStyle;

        // --- TABLE HEADERS ---
        const tableHeaderRow = rowStart + 2;
        const headerRow = sheet.getRow(tableHeaderRow);

        options.columns.forEach((col, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = col.header;
            cell.style = headerStyle;

            // Auto-width logic (heuristic)
            const column = sheet.getColumn(index + 1);
            column.width = col.width || 20;
            if (col.key.includes('amount') || col.key.includes('price') || col.key.includes('total')) {
                column.numFmt = '"$"#,##0';
            }
        });

        // --- DATA ROWS ---
        options.data.forEach((item, index) => {
            const row = sheet.getRow(tableHeaderRow + 1 + index);

            options.columns.forEach((col, colIndex) => {
                const cell = row.getCell(colIndex + 1);
                const value = item[col.key];
                cell.value = value;

                // Zebra Striping
                if (index % 2 !== 0) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF9FAFB' } // Slate 50
                    };
                }

                // Borders
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };

                // Alignment overrides
                if (typeof value === 'number') {
                    cell.alignment = { horizontal: 'right' };
                }
            });
        });

        // Generate Buffer
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer as Buffer;
    }
}
