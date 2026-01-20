
import { BaseStrategy } from "./BaseStrategy";
import { ImportResult, UnifiedProduct } from "../types";

export class CenabastStrategy extends BaseStrategy {
    name = "Catálogo Cenabast (Maestro)";
    signatures = ["codigo generico", "nombre producto generico", "clasificacion interna"];

    matches(headers: string[]): boolean {
        const norm = headers.map(h => this.normalizeHeader(h));
        // User requested: "Código genérico", "Nombre producto genérico"
        return (norm.includes("codigo generico") && norm.includes("nombre producto generico"))
            || (norm.includes("codigo cenabast") && norm.includes("producto"));
    }

    async parse(rows: any[], sourceName: string): Promise<ImportResult> {
        const products: UnifiedProduct[] = [];

        for (const row of rows) {
            // Flexible Key Access
            const val = (keyChunk: string) => {
                const key = Object.keys(row).find(k => this.normalizeHeader(k).includes(keyChunk));
                return key ? row[key] : undefined;
            };

            const cenabastId = this.cleanString(val('codigo generico') || val('codigo'));
            const genericName = this.cleanString(val('nombre producto generico') || val('producto'));
            const desc = this.cleanString(val('descripcion'));
            const clasificacion = this.cleanString(val('clasificacion'));

            // Cenabast doesn't have barcodes. 
            // We use the Generic Name as the key to enrich our master data later.
            // ID: GEN-1234

            const product: UnifiedProduct = {
                primaryParams: {
                    barcode: `GEN-${cenabastId}`,
                    sku: undefined
                },
                nombreComercial: genericName, // It's generic
                accionTerapeutica: clasificacion,

                inventario: [], // No physical stock
                origen: ["Cenabast"],
                tags: ["Maestro Generico"],
                rawMetadata: {
                    ...row,
                    description_full: desc
                }
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
