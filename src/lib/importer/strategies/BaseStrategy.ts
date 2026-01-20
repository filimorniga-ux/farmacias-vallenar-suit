
import { ImportResult, ImportStrategy, UnifiedProduct } from "../types";

export abstract class BaseStrategy implements ImportStrategy {
    abstract name: string;
    abstract signatures: string[];

    matches(headers: string[]): boolean {
        const normalizedHeaders = headers.map(h => this.normalizeHeader(h));
        // Check if ANY of the signatures exist in headers? Or ALL?
        // Usually, presence of specific distinct columns is enough.
        // Let's say if it matches at least 70% of signatures, or critical ones.
        // For simplicity: Check if ALL critical signatures are present.
        const found = this.signatures.filter(sig =>
            normalizedHeaders.includes(this.normalizeHeader(sig))
        );
        return found.length === this.signatures.length;
    }

    abstract parse(rows: any[], sourceName: string): Promise<ImportResult>;

    protected normalizeHeader(header: string): string {
        return String(header)
            .trim()
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Strip accents: Código -> Codigo
            .replace(/_/g, ' ')
            .replace(/\./g, '');
    }

    protected cleanString(val: any): string {
        if (!val) return '';
        return String(val).trim().toUpperCase();
    }

    protected cleanNumber(val: any): number {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^0-9.,]/g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    }

    protected extractBarcodes(val: any): string[] {
        if (!val) return [];
        let str = String(val);
        // Handle Excel formula object
        if (typeof val === 'object' && val.result) str = String(val.result);

        return str.split(/[,;]/)
            .map(s => s.trim().replace(/[^0-9]/g, ''))
            .filter(s => s.length > 5); // Filter junk
    }
}
