
import { BaseStrategy } from "./BaseStrategy";
import { ImportResult, UnifiedProduct } from "../types";

export class LegacyStrategy extends BaseStrategy {
    name = "Inventario Simple (Legacy)";
    signatures = ["producto", "codigo", "stock", "precio"];

    matches(headers: string[]): boolean {
        const norm = headers.map(h => this.normalizeHeader(h));
        // Match standard legacy dump
        return (norm.includes("producto") && norm.includes("codigo"))
            || (norm.includes("descripcion") && norm.includes("precio"));
    }

    async parse(rows: any[], sourceName: string): Promise<ImportResult> {
        const products: UnifiedProduct[] = [];

        for (const i in rows) {
            const row = rows[i];
            // CSV columns might be "Producto", "Codigo", "Stock"...
            // We use normalized matching helper if needed, but rows are usually keyed by header found in CSV parse.
            // If CSV Parser used the original header "CÃ³digo", we need to access via that.
            // SmartImporter uses `columns: true` which uses the first line as keys.
            // But if encoding messed up keys, we have a problem.

            // Safe getter using fuzzy key match
            const val = (keyChunk: string) => {
                const key = Object.keys(row).find(k => this.normalizeHeader(k).includes(keyChunk));
                return key ? row[key] : undefined;
            };

            const barcode = this.cleanString(val('codigo'));
            const nombre = this.cleanString(val('producto'));
            const stock = this.cleanNumber(val('stock'));
            const costo = this.cleanNumber(val('costo'));
            const precio = this.cleanNumber(val('precio'));
            const cat = this.cleanString(val('categoria'));

            if (!barcode && !nombre) continue;

            const product: UnifiedProduct = {
                primaryParams: {
                    barcode: barcode || `LEGACY-${i}`,
                    sku: undefined
                },
                nombreComercial: nombre,
                accionTerapeutica: cat,

                inventario: [{
                    sucursal: "Legacy Backup",
                    stock: stock,
                    precioVenta: precio,
                    costoNeto: costo
                }],
                origen: ["Legacy"],
                tags: ["Backup"],
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
