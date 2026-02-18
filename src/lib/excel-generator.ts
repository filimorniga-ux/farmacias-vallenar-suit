import ExcelJS from 'exceljs';
import { TIMEZONE, formatDateTimeCL } from './timezone';

interface SheetDefinition {
    name: string;
    title: string;
    subtitle?: string;
    columns: { header: string; key: string; width?: number; style?: Partial<ExcelJS.Style> }[];
    data: any[];
}

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
    // Standard Header Style
    static readonly HEADER_STYLE: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0052CC' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
        }
    };

    static readonly TITLE_STYLE: Partial<ExcelJS.Style> = {
        font: { bold: true, size: 18, color: { argb: 'FF1F2937' } },
    };

    async generateReport(options: ExportOptions): Promise<Buffer> {
        return this.generateMultiSheetReport({
            creator: options.creator,
            locationName: options.locationName,
            sheets: [{
                name: options.sheetName || 'Reporte',
                title: options.title,
                subtitle: options.subtitle,
                columns: options.columns,
                data: options.data
            }]
        });
    }

    async generateMultiSheetReport(options: {
        creator?: string;
        locationName?: string;
        sheets: SheetDefinition[];
    }): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = options.creator || 'Farmacias Vallenar Suit';
        workbook.created = new Date();

        for (const sheetDef of options.sheets) {
            const sheet = workbook.addWorksheet(sheetDef.name);

            // --- STYLES ---
            const metaStyle: Partial<ExcelJS.Style> = {
                font: { italic: true, size: 10, color: { argb: 'FF6B7280' } }
            };

            // --- TITLE SECTION ---
            const colCount = sheetDef.columns.length;
            const lastColLetter = String.fromCharCode(64 + Math.min(colCount, 26));

            sheet.mergeCells(`A1:${lastColLetter}1`);
            const titleCell = sheet.getCell('A1');
            titleCell.value = sheetDef.title.toUpperCase();
            titleCell.style = ExcelService.TITLE_STYLE;
            sheet.getRow(1).height = 30;

            if (sheetDef.subtitle) {
                sheet.mergeCells(`A2:${lastColLetter}2`);
                const subtitleCell = sheet.getCell('A2');
                subtitleCell.value = sheetDef.subtitle;
                subtitleCell.style = { font: { size: 12, color: { argb: 'FF4B5563' } } };
                sheet.getRow(2).height = 20;
            }

            const rowStart = sheetDef.subtitle ? 4 : 3;
            const dateStr = formatDateTimeCL(new Date());

            sheet.mergeCells(`A${rowStart}:${lastColLetter}${rowStart}`);
            const metaCell = sheet.getCell(`A${rowStart}`);
            metaCell.value = `Generado el: ${dateStr} | Por: ${options.creator || 'Sistema'} | Sucursal: ${options.locationName || 'General'}`;
            metaCell.style = metaStyle;

            // --- TABLE HEADERS ---
            const tableHeaderRow = rowStart + 2;
            const headerRow = sheet.getRow(tableHeaderRow);
            headerRow.height = 25;

            sheet.autoFilter = {
                from: { row: tableHeaderRow, column: 1 },
                to: { row: tableHeaderRow, column: colCount }
            };

            sheet.views = [
                { state: 'frozen', xSplit: 0, ySplit: tableHeaderRow, activeCell: 'A' + (tableHeaderRow + 1) }
            ];

            sheetDef.columns.forEach((col, index) => {
                const cell = headerRow.getCell(index + 1);
                cell.value = col.header;
                cell.style = ExcelService.HEADER_STYLE;

                const column = sheet.getColumn(index + 1);
                column.width = col.width || 20;

                if (col.key.toLowerCase().includes('cost') ||
                    col.key.toLowerCase().includes('price') ||
                    col.key.toLowerCase().includes('total') ||
                    col.key.toLowerCase().includes('monto') ||
                    col.key.toLowerCase().includes('value')) {
                    column.numFmt = '"$"#,##0';
                }
            });

            // --- DATA ROWS ---
            sheetDef.data.forEach((item, index) => {
                const row = sheet.getRow(tableHeaderRow + 1 + index);

                sheetDef.columns.forEach((col, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    const value = item[col.key];
                    cell.value = value;

                    if (index % 2 !== 0) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF9FAFB' }
                        };
                    }

                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };

                    if (typeof value === 'number') {
                        cell.alignment = { horizontal: 'right' };
                    } else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                    }

                    if (col.style) {
                        cell.style = { ...cell.style, ...col.style };
                    }
                });
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer as unknown as Buffer;
    }
}


