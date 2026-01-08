import { InventoryBatch } from '../domain/types';

/**
 * Normaliza un texto para búsqueda (minusculas, sin acentos).
 */
const normalize = (text: string) => {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Busca productos en el inventario local (en memoria).
 * Agrupa por SKU para mostrar producto único con stock total.
 */
export const searchProductsLocal = (term: string, inventory: InventoryBatch[]) => {
    if (!term || term.length < 2) return [];

    const query = normalize(term);
    const results = new Map<string, any>();

    for (const item of inventory) {
        // Filtro simple: nombre o sku
        const matchName = normalize(item.name).includes(query);
        const matchSku = normalize(item.sku).includes(query);
        const matchActive = item.active_ingredients ? normalize(item.active_ingredients.join(' ')).includes(query) : false;

        if (matchName || matchSku || matchActive) {
            if (!results.has(item.sku)) {
                results.set(item.sku, {
                    id: item.id, // ID representativo
                    name: item.name,
                    sku: item.sku,
                    price: item.price,
                    stock: 0,
                    active_ingredients: item.active_ingredients,
                    requires_prescription: false // Default to false as it is not in InventoryBatch
                });
            }
            const product = results.get(item.sku);
            product.stock += item.stock_actual;
        }
    }

    return Array.from(results.values());
};

/**
 * Encuentra el mejor lote para vender (FEFO/FIFO) localmente.
 * Prioriza fecha de vencimiento más próxima (si existe), luego ID (FIFO proxy).
 */
export const findBestBatchLocal = (sku: string, inventory: InventoryBatch[]) => {
    const candidates = inventory.filter(i => i.sku === sku && i.stock_actual > 0);

    if (candidates.length === 0) {
        return { success: false, error: 'Sin stock disponible localmente' };
    }

    // Ordenar: 
    // 1. Expiry Date ASC (nulls last)
    // 2. ID ASC (FIFO proxy if time-based IDs)
    candidates.sort((a, b) => {
        const expiryA = a.expiry_date || 9999999999999;
        const expiryB = b.expiry_date || 9999999999999;

        if (expiryA !== expiryB) return expiryA - expiryB;

        return a.id.localeCompare(b.id);
    });

    const bestBatch = candidates[0];

    return {
        success: true,
        batch: {
            id: bestBatch.id,
            price: bestBatch.price,
            quantity: bestBatch.stock_actual
        }
    };
};
