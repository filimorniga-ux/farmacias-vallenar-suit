
import { BaseStrategy } from "./BaseStrategy";
import { ImportResult, UnifiedProduct } from "../types";

export class IspStrategy extends BaseStrategy {
    name = "Maestro ISP (Oficial)";
    signatures = ["registro", "principio activo", "titular", "estado"];

    matches(headers: string[]): boolean {
        const norm = headers.map(h => this.normalizeHeader(h));
        return norm.includes("registro") && norm.includes("principio activo");
    }

    async parse(rows: any[], sourceName: string): Promise<ImportResult> {
        const products: UnifiedProduct[] = [];

        for (const row of rows) {
            const registro = this.cleanString(row['Registro']);
            const nombre = this.cleanString(row['Producto']);
            const principio = this.cleanString(row['Principio Activo']);
            const uso = this.cleanString(row['Uso / Tratamiento']);

            // ISP file doesn't have barcodes usually.
            // It relies on Name Matching later in the pipeline.
            // We return a "Partial Product" that the Importer logic will use for enrichment.
            // We use the Registro or Name as key.

            const product: UnifiedProduct = {
                primaryParams: {
                    barcode: `ISP-${registro}`, // Synthetic ID
                    sku: undefined
                },
                nombreComercial: nombre,
                principioActivo: principio,
                accionTerapeutica: uso,
                registroIsp: registro,
                esBioequivalente: String(row['Estado']).includes("EQUIVALENTE"),

                inventario: [], // No stock info in ISP
                origen: ["ISP"],
                tags: ["Regulatorio"],
                rawMetadata: row
            };
            products.push(product);
        }

        return {
            products,
            errors: [],
            metadata: {
                sourceType: this.name,
                totalProcessed: rows.length,
                totalSuccess: products.length,
                totalErrors: 0
            }
        };
    }
}
