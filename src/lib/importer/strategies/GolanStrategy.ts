
import { BaseStrategy } from "./BaseStrategy";
import { ImportResult, UnifiedProduct } from "../types";

export class GolanStrategy extends BaseStrategy {
    name = "Golan (Proveedor Externo)";
    signatures = ["Grupo de Producto", "Costo Neto Prom Unitario", "Producto"]; // Normalized check

    matches(headers: string[]): boolean {
        // Signatures are: "Grupo de Producto", "Costo Neto Prom. Unitario"
        // Normalized: "grupo de producto", "costo neto prom unitario"
        const normHeaders = headers.map(h => this.normalizeHeader(h));
        return normHeaders.includes("grupo de producto") &&
            (normHeaders.includes("costo neto prom unitario") || normHeaders.includes("costo"));
    }

    async parse(rows: any[], sourceName: string): Promise<ImportResult> {
        const products: UnifiedProduct[] = [];
        const errors: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // 1. Extract Barcodes (The King)
            const barcodes = this.extractBarcodes(row['Código Barras']);

            if (barcodes.length === 0) {
                // If no barcode, it's virtually useless for this strict strategy
                // Or maybe we treat it as an orphan? For now, skip or log.
                // Let's try to find if there is at least a name
                if (!row['Producto']) {
                    continue; // Skip empty rows
                }

                // If it has name but no barcode, maybe create a GOL-ID?
                // For now, let's stick to "Barcode First". 
                // But wait, if we skip it, we lose inventory. 
                // Let's use the first barcode as primary ID, or generate one if missing?
                // User said: "Si NO hay match... Crea el producto... usando los datos de Golan"
                // Implicitly assumes we have *some* ID. We'll generate a Fallback ID if barcode missing.
            }

            const primaryBarcode = barcodes.length > 0 ? barcodes[0] : `GOL-GEN-${i}`;
            const stock = this.cleanNumber(row['Stock']);
            const costo = this.cleanNumber(row['Costo Neto Prom. Unitario']);
            const nombre = this.cleanString(row['Producto']);
            const marca = this.cleanString(row['marca']); // Case sensitive in excel? check

            const product: UnifiedProduct = {
                primaryParams: {
                    barcode: primaryBarcode,
                    sku: undefined // Golan doesn't provide our internal SKU usually
                },
                nombreComercial: nombre,
                marca: marca,
                inventario: [{
                    sucursal: "Bodega Golan",
                    stock: stock,
                    costoNeto: costo,
                    ubicacion: "Bodega Central"
                }],
                origen: ["Golan"],
                tags: barcodes.length === 0 ? ["Sin Codigo Barra", "Generado Auto"] : [],
                rawMetadata: row
            };

            products.push(product);
        }

        return {
            products,
            errors,
            metadata: {
                sourceType: this.name,
                totalProcessed: rows.length,
                totalSuccess: products.length,
                totalErrors: errors.length
            }
        };
    }
}
