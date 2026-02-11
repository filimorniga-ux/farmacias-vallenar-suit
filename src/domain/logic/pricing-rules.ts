
/**
 * Reglas de Negocio para Precios (Chile)
 * Implementa redondeo psicológico 50/100 y cálculos de margen.
 */

// Regla de Oro: Trabajar siempre con ENTEROS.
// En caso de división, usar Math.round al final.

/**
 * Calcula el precio sugerido basado en costo, IVA opcional y margen deseado.
 * @param cost Costo neto del producto (Entero)
 * @param applyTax Si se debe sumar IVA (19%) al costo antes del margen
 * @param marginPercent Porcentaje de ganancia deseado (ej: 40 para 40%)
 * @returns Precio sugerido redondeado según regla 50/100
 */
export const calculateRecommendedPrice = (
    cost: number,
    applyTax: boolean,
    marginPercent: number
): number => {
    if (cost < 0) return 0;

    // 1. Base cost (con o sin IVA)
    const baseCost = applyTax ? cost * 1.19 : cost;

    // 2. Aplicar margen por sobre el costo base
    // Precio = Costo * (1 + Margen%)
    const rawPrice = baseCost * (1 + (marginPercent / 100));

    // 3. Redondeo inteligente
    return applySmartRounding(rawPrice);
};

/**
 * Aplica la regla de redondeo "50/100" chilena.
 * - Siempre hacia arriba al múltiplo de 50 más cercano (ceiling).
 * - Ej: 1001 -> 1050
 * - Ej: 1049 -> 1050
 * - Ej: 1050 -> 1050
 * - Ej: 1051 -> 1100
 */
export const applySmartRounding = (value: number): number => {
    if (value <= 0) return 0;
    return Math.ceil(value / 50) * 50;
};

/**
 * Calcula el margen real dado un precio y un costo.
 * @returns Porcentaje de margen (ej: 40.5)
 */
export const calculateMargin = (price: number, cost: number, includesTax: boolean): number => {
    if (cost <= 0) return 100; // Evitar división por cero
    const baseCost = includesTax ? cost * 1.19 : cost;
    if (baseCost <= 0) return 100;

    return Number((((price - baseCost) / baseCost) * 100).toFixed(2));
};
