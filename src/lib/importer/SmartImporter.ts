
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx'; // Native Excel Library as requested
import { parse as parseCsv } from 'csv-parse/sync';
import { ImportResult, ImportStrategy } from './types';
import { GolanStrategy } from './strategies/GolanStrategy';
import { PosStrategy } from './strategies/PosStrategy';
import { IspStrategy } from './strategies/IspStrategy';
import { CenabastStrategy } from './strategies/CenabastStrategy';
import { LegacyStrategy } from './strategies/LegacyStrategy';

export class SmartImporter {
    private strategies: ImportStrategy[] = [];

    constructor() {
        // Register Strategies
        this.strategies.push(new GolanStrategy());
        this.strategies.push(new PosStrategy());
        this.strategies.push(new IspStrategy());
        this.strategies.push(new CenabastStrategy());
        this.strategies.push(new LegacyStrategy());
    }

    /**
     * Main Entry Point
     */
    async importFile(filePath: string): Promise<ImportResult> {
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

        console.log(`🔍 Analyzing file: ${path.basename(filePath)}`);

        // Try Excel (xlsx)
        try {
            // Read file buffer first to avoid locking issues? 
            // XLSX.readFile is synchronous and robust.
            const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
            const sheetName = workbook.SheetNames[0]; // First sheet
            const worksheet = workbook.Sheets[sheetName];

            if (!worksheet) throw new Error("No sheet found");

            // Convert sheet to JSON array of arrays (headerless) to scan
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

            // Detect Strategy
            const detection = this.detectStrategy(rawData);

            if (detection) {
                console.log(`✅ Detected (XLSX): ${detection.strategy.name} (Header at Row ${detection.headerIndex + 1})`);

                // Re-parse with header offset
                // sheet_to_json with 'range' option? Or just slice the rawData?
                // Let's us slice rawData. The header row is at detection.headerIndex.

                const headerRow = rawData[detection.headerIndex].map(String);
                const dataRows = rawData.slice(detection.headerIndex + 1);

                // Map array rows to objects using header
                const mappedRows = dataRows.map(row => {
                    const obj: any = {};
                    headerRow.forEach((key, idx) => {
                        obj[key] = row[idx];
                    });
                    return obj;
                });

                return await detection.strategy.parse(mappedRows, path.basename(filePath));
            }

            // If Excel detection failed, maybe it's CSV renamed as xlsx? Or just try CSV fallback logic below logic block
        } catch (e: any) {
            console.error(`❌ XLSX Read Error for ${path.basename(filePath)}:`, e.message);
        }

        // Fallback: CSV Handling for true CSVs or failed Excel reads
        console.log(`⚠️ Falling back to CSV parser for ${path.basename(filePath)}`);

        let content = '';
        try {
            content = fs.readFileSync(filePath, 'utf-8');
            if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // Strip BOM
        } catch (e) {
            content = fs.readFileSync(filePath, 'latin1');
        }

        // Heuristic: Check for common delimiters
        const delimiters = [',', ';', '\t', '|'];
        const firstLine = content.substring(0, 1000).split('\n')[0];

        // Find best delimiter
        let bestDelim = ',';
        let maxCols = 1;

        for (const d of delimiters) {
            const cols = firstLine.split(d).length;
            if (cols > maxCols) {
                maxCols = cols;
                bestDelim = d;
            }
        }

        // Simple manual split for detection scan
        const lines = content.split('\n').map(l => l.split(bestDelim));
        const detection = this.detectStrategy(lines);

        if (!detection) {
            throw new Error("Could not detect file type (Unknown format).");
        }

        console.log(`✅ Detected (CSV): ${detection.strategy.name} (Header at Line ${detection.headerIndex + 1})`);

        const parsedData = parseCsv(content, {
            delimiter: bestDelim,
            columns: true,
            from_line: detection.headerIndex + 1,
            skip_empty_lines: true,
            relax_column_count: true
        });

        return await detection.strategy.parse(parsedData, path.basename(filePath));
    }

    private detectStrategy(rows: any[][]): { strategy: ImportStrategy, headerIndex: number } | null {
        // Scan first 20 rows
        const SCAN_LIMIT = 20;

        for (let i = 0; i < Math.min(rows.length, SCAN_LIMIT); i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;

            // Filter nulls and empty strings
            const headers = row.map(c => String(c || '').trim()).filter(c => c.length > 0);
            if (headers.length < 2) continue; // Too few columns to be a header

            for (const strategy of this.strategies) {
                if (strategy.matches(headers)) {
                    return { strategy, headerIndex: i };
                }
            }
        }
        return null;
    }
}
