/**
 * Utilitarios para manejo de inventario
 */

/**
 * Formatea un SKU para visualización, ocultando SKUs temporales o automáticos.
 */
export const formatSku = (sku?: string) => {
    if (!sku) return '---';
    if (sku.startsWith('AUTO-') || sku.startsWith('TEMP-')) return '---';
    return sku;
};

/**
 * Detecta inteligentemente la cantidad de unidades en un producto.
 * Prioriza campos explícitos de la base de datos, luego intenta inferir del nombre.
 */
export const getEffectiveUnits = (item: any) => {
    // 1. Try explicit DB fields first
    const dbUnits = item.units_per_box || item.unit_count || item.units_per_package || 0;
    if (dbUnits > 1) return dbUnits;

    // 2. Try Heuristic from Name (e.g., "X60", "X 30", "X100")
    // Matches "X" followed immediately or by space by a number
    const name = item.name || '';
    const match = name.match(/X\s?(\d+)/i);

    if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 1 && parsed < 1000) return parsed; // Sanity check
    }

    return 1; // Fallback
};
