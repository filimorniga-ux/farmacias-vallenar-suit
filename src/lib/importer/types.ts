
export interface ImportResult {
    products: UnifiedProduct[];
    errors: ImportError[];
    metadata: {
        sourceType: string;
        totalProcessed: number;
        totalSuccess: number;
        totalErrors: number;
    };
}

export interface ImportError {
    row: number;
    data: any;
    reason: string;
}

export interface InventoryItem {
    sucursal: string; // "Vallenar SUC 1", "Bodega Golan", etc.
    stock: number;
    precioVenta?: number; // Precio público real
    costoNeto?: number;   // Costo interno (Golan)
    ubicacion?: string;
}

export interface UnifiedProduct {
    // Identity
    primaryParams: {
        barcode: string; // The "Barcode First" Key
        sku?: string;    // SKU if available (e.g. Vallenar SKU)
    };

    // Core Data
    nombreComercial: string;
    marca?: string;
    laboratorio?: string;

    // Clinical / Regulatory (Enrichment)
    principioActivo?: string;
    accionTerapeutica?: string;
    registroIsp?: string;
    recetaMedica?: boolean;
    esBioequivalente?: boolean;

    // Inventory
    inventario: InventoryItem[];

    // Metadata
    origen: string[]; // ["Golan", "Vallenar"]
    tags: string[]; // ["Nuevo", "Enriquecido", "Sin Match"]
    rawMetadata?: any; // Original row data for debugging
}

export interface ImportStrategy {
    name: string;
    signatures: string[]; // Column names that identify this file

    /**
     * Detects if the given header row roughly matches this strategy
     */
    matches(headers: string[]): boolean;

    /**
     * Parses the rows into UnifiedProducts
     */
    parse(rows: any[], sourceName: string): Promise<ImportResult>;
}
