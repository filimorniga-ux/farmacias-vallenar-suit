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
    // Standard Colors
    static readonly COLOR_PRIMARY = 'FF0056B3'; // Azul Corporativo Vallenar
    static readonly COLOR_ROW_ALT = 'FFF0F4F8'; // Azul ultra sutil para Zebra Striping
    static readonly COLOR_TOTAL_BG = 'FFE5E7EB'; // Gris para fila de totales

    // Standard Header Style
    static readonly HEADER_STYLE: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelService.COLOR_PRIMARY } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
        }
    };

    static readonly TITLE_STYLE: Partial<ExcelJS.Style> = {
        font: { bold: true, size: 16, color: { argb: 'FF333333' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
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
                font: { italic: true, size: 10, color: { argb: 'FF6B7280' } },
                alignment: { horizontal: 'left' }
            };

            // --- TITLE SECTION (Rows 1-2) ---
            const colCount = sheetDef.columns.length;
            const lastColLetter = String.fromCharCode(64 + Math.min(colCount, 26));

            sheet.mergeCells(`A1:${lastColLetter}2`);
            const titleCell = sheet.getCell('A1');
            titleCell.value = (sheetDef.title + (sheetDef.subtitle ? ` - ${sheetDef.subtitle}` : '')).toUpperCase();
            titleCell.style = ExcelService.TITLE_STYLE;
            sheet.getRow(1).height = 25;
            sheet.getRow(2).height = 25;

            // --- METADATA (Row 3) ---
            const dateStr = formatDateTimeCL(new Date());
            sheet.mergeCells(`A3:${lastColLetter}3`);
            const metaCell = sheet.getCell('A3');
            metaCell.value = `Sucursal: ${options.locationName || 'General'} | Generado por: ${options.creator || 'Sistema'} | Fecha de Generación: ${dateStr}`;
            metaCell.style = metaStyle;
            sheet.getRow(3).height = 20;

            // --- EMPTY SPACE (Row 4) ---
            sheet.getRow(4).height = 15;

            // --- TABLE HEADERS (Row 5) ---
            const tableHeaderRow = 5;
            const headerRow = sheet.getRow(tableHeaderRow);
            headerRow.height = 28;

            sheet.autoFilter = {
                from: { row: tableHeaderRow, column: 1 },
                to: { row: tableHeaderRow, column: colCount }
            };

            // Freeze Panes: Row 5 and Column 1
            sheet.views = [
                { state: 'frozen', xSplit: 1, ySplit: tableHeaderRow, activeCell: 'B' + (tableHeaderRow + 1) }
            ];

            sheetDef.columns.forEach((col, index) => {
                const cell = headerRow.getCell(index + 1);
                cell.value = col.header.toUpperCase();
                cell.style = ExcelService.HEADER_STYLE;

                const column = sheet.getColumn(index + 1);
                // Calculate Column Width (UX Auto-fit simulation)
                const headerLen = col.header.length;
                const dataMaxLen = sheetDef.data.reduce((max, item) => {
                    const val = item[col.key];
                    const strLen = val ? String(val).length : 0;
                    return Math.max(max, strLen);
                }, 0);
                column.width = col.width || Math.max(12, Math.min(45, Math.max(headerLen, dataMaxLen) * 1.2));

                // Strict Formatting
                const key = col.key.toLowerCase();
                if (key.includes('cost') || key.includes('price') || key.includes('total') || key.includes('monto') || key.includes('valor')) {
                    column.numFmt = '"$ "* #,##0'; // Formato Contable CLP
                } else if (key.includes('fecha') || key.includes('date') || key.includes('at')) {
                    column.numFmt = 'dd/mm/yyyy';
                }
            });

            // --- DATA ROWS ---
            sheetDef.data.forEach((item, index) => {
                const rowNum = tableHeaderRow + 1 + index;
                const row = sheet.getRow(rowNum);
                row.height = 22;

                sheetDef.columns.forEach((col, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    let value = item[col.key];

                    // Boolean translation
                    if (typeof value === 'boolean') {
                        value = value ? 'SÍ' : 'NO';
                    }

                    cell.value = value;

                    // Zebra Striping
                    if (index % 2 !== 0) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: ExcelService.COLOR_ROW_ALT }
                        };
                    }

                    // Base alignment and formatting
                    const key = col.key.toLowerCase();
                    if (typeof value === 'number') {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    } else if (key.includes('fecha') || key.includes('date') || key.includes('at') || typeof item[col.key] === 'boolean') {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                    }

                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };

                    if (col.style) {
                        cell.style = { ...cell.style, ...col.style };
                    }
                });
            });

            // --- TOTALS ROW (Optional - if numeric columns exist) ---
            const lastDataRow = tableHeaderRow + sheetDef.data.length;
            const totalsRow = sheet.getRow(lastDataRow + 1);
            totalsRow.height = 25;

            let hasTotals = false;
            sheetDef.columns.forEach((col, colIndex) => {
                const key = col.key.toLowerCase();
                const isNumeric = key.includes('total') || key.includes('monto') || key.includes('quantity') || key.includes('cantidad');

                if (isNumeric && sheetDef.data.length > 0) {
                    hasTotals = true;
                    const cell = totalsRow.getCell(colIndex + 1);
                    const colLetter = sheet.getColumn(colIndex + 1).letter;
                    cell.value = { formula: `SUM(${colLetter}${tableHeaderRow + 1}:${colLetter}${lastDataRow})` };
                    cell.font = { bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelService.COLOR_TOTAL_BG } };
                    cell.border = { top: { style: 'thick' } };
                    if (sheet.getColumn(colIndex + 1).numFmt) {
                        cell.numFmt = sheet.getColumn(colIndex + 1).numFmt as string;
                    }
                } else if (colIndex === 0) {
                    const cell = totalsRow.getCell(1);
                    cell.value = 'TOTALES GENERALES';
                    cell.font = { bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelService.COLOR_TOTAL_BG } };
                    cell.border = { top: { style: 'thick' } };
                }
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer as unknown as Buffer;
    }
}


