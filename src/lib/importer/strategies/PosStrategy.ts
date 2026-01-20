
import { BaseStrategy } from "./BaseStrategy";
import { ImportResult, UnifiedProduct } from "../types";

export class PosStrategy extends BaseStrategy {
    name = "Inventario Sucursal (Vallenar)";
    signatures = ["sukursal", "sku", "titulo", "precio"]; // Normalized ("sucursal" -> "sukursal"? No, normalizeHeader makes "SUCURSAL" -> "sucursal")

    // Override normalizeHeader slightly or just use correct signatures
    matches(headers: string[]): boolean {
        const norm = headers.map(h => this.normalizeHeader(h));
        return norm.includes("sucursal") && norm.includes("sku") && norm.includes("titulo");
    }

    async parse(rows: any[], sourceName: string): Promise<ImportResult> {
        const products: UnifiedProduct[] = [];

        for (const row of rows) {
            // 1. Barcodes (Split comma separated)
            // Vallenar: "7801, 7802"
            const barcodes = this.extractBarcodes(row['CODIGOS_BARRA']);
            const sku = String(row['SKU']).trim();

            // Primary ID: Barcode if exists, else SKU
            const primaryBarcode = barcodes.length > 0 ? barcodes[0] : `SKU-${sku}`;

            const sucursalName = row['SUCURSAL'] || sourceName;
            const precio = this.cleanNumber(row['PRECIO']);
            const stock = this.cleanNumber(row['STOCK']);
            const nombre = this.cleanString(row['TITULO']);
            const lab = this.cleanString(row['LABORATORIO']);

            // Enrichment Fields
            const principios = this.cleanString(row['PRINCIPIOS ACTIVOS']);
            const accion = this.cleanString(row['ACCION_TERAPEUTICA']);
            const bio = this.cleanString(row['BIOEQUIVALENTE']) === "SI";
            const isp = this.cleanString(row['CODIGO ISP']);
            const receta = this.cleanString(row['RECETA MEDICA']);

            const product: UnifiedProduct = {
                primaryParams: {
                    barcode: primaryBarcode,
                    sku: sku
                },
                nombreComercial: nombre,
                laboratorio: lab,
                principioActivo: principios,
                accionTerapeutica: accion,
                registroIsp: isp,
                esBioequivalente: bio,
                recetaMedica: receta.includes("RETENIDA") || receta.includes("RECETA"),

                inventario: [{
                    sucursal: sucursalName,
                    stock: stock,
                    precioVenta: precio
                }],
                origen: ["Vallenar"],
                tags: ["POS"],
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
