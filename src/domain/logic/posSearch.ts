import { InventoryBatch } from '../types';

const normalize = (value?: string): string => (value || '').toLowerCase();
const buildGroupKey = (item: InventoryBatch): string => {
    const base = item.product_id || item.sku || item.name || item.id;
    const mode = item.is_retail_lot ? 'retail' : 'box';
    return `${base}::${mode}`;
};

/**
 * Orden FEFO para lotes en POS.
 * Mantiene compatibilidad con el comportamiento previo (sin fecha => 0).
 */
export function sortInventoryForPOS(inventory: InventoryBatch[]): InventoryBatch[] {
    return [...inventory].sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0));
}

/**
 * Filtro de búsqueda del POS con cobertura de campos de lote.
 */
export function filterInventoryForPOS(
    inventory: InventoryBatch[],
    searchTerm: string
): InventoryBatch[] {
    const lowerTerm = normalize(searchTerm.trim());

    if (!lowerTerm) {
        return inventory;
    }

    return inventory.filter(item =>
        normalize(item.name).includes(lowerTerm) ||
        normalize(item.sku).includes(lowerTerm) ||
        normalize(item.dci).includes(lowerTerm) ||
        normalize(item.lot_number).includes(lowerTerm) ||
        normalize(item.barcode).includes(lowerTerm) ||
        normalize(item.laboratory).includes(lowerTerm)
    );
}

/**
 * Arma catálogo POS por producto, consolidando stock de todos sus lotes y
 * seleccionando un lote "vendible" (stock > 0) para operaciones de carrito.
 */
export function buildPOSCatalog(
    sortedInventory: InventoryBatch[]
): InventoryBatch[] {
    if (sortedInventory.length === 0) {
        return [];
    }

    const grouped = new Map<string, InventoryBatch[]>();
    for (const item of sortedInventory) {
        const key = buildGroupKey(item);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(item);
    }

    const catalog: InventoryBatch[] = [];
    for (const items of grouped.values()) {
        const sellableItems = items.filter(item => (item.stock_actual || 0) > 0);
        const sortedCandidates = (sellableItems.length > 0 ? sellableItems : items).sort(
            (a, b) => (a.expiry_date || 0) - (b.expiry_date || 0)
        );
        const representative = sortedCandidates[0];
        if (!representative) continue;

        const totalStock = items.reduce((acc, item) => acc + Number(item.stock_actual || 0), 0);
        const mergedLots = Array.from(new Set(
            items
                .map(item => (item.lot_number || '').trim())
                .filter(Boolean)
        )).join(' ');

        catalog.push({
            ...representative,
            stock_actual: totalStock,
            // Conserva capacidad de búsqueda por lote en catálogo consolidado.
            lot_number: mergedLots || representative.lot_number,
        });
    }

    return catalog.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

/**
 * Selecciona lote al detal disponible para un producto del carrito.
 * Prioriza mismo product_id y FEFO.
 */
export function selectRetailLotCandidate(
    inventory: InventoryBatch[],
    sourceItem: InventoryBatch
): InventoryBatch | undefined {
    if (sourceItem.is_retail_lot) {
        return undefined;
    }

    const candidates = inventory.filter(item => {
        if (!item.is_retail_lot) return false;
        if ((item.stock_actual || 0) <= 0) return false;
        if (item.id === sourceItem.id) return false;

        if (sourceItem.product_id && item.product_id) {
            return item.product_id === sourceItem.product_id;
        }

        return item.sku === sourceItem.sku;
    });

    if (candidates.length === 0) {
        return undefined;
    }

    return [...candidates].sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0))[0];
}
