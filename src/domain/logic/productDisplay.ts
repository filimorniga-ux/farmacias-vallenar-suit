import { InventoryBatch } from '../types';

export const formatProductLabel = (product: InventoryBatch): string => {
    // Format: [NOMBRE] - [DCI] [CONCENTRACION] - [FORMATO] x[UNIDADES] ([LAB])
    const name = product.name || 'SIN NOMBRE';
    const dci = product.dci ? `${product.dci} ` : '';
    const concentration = product.concentration || '';
    const format = product.format ? `${product.format} ` : '';
    const units = product.units_per_box || product.unit_count || 1;
    const lab = product.laboratory ? `(${product.laboratory})` : '';

    const details = `${dci}${concentration}`.trim();
    const formatStr = format.trim();

    let label = name;
    if (details) label += ` - ${details}`;
    if (formatStr) label += ` - ${formatStr}`;
    label += ` x${units}`;
    if (lab) label += ` ${lab}`;

    return label;
};

export const roundToNearest50 = (price: number): number => {
    return Math.ceil(price / 50) * 50;
};

export const calculatePricePerUnit = (product: InventoryBatch): number => {
    // Si ya existe un precio fraccionado explícito (ej. de una lista de precios), lo usamos
    if (product.fractional_price && product.fractional_price > 0) {
        return product.fractional_price;
    }

    // El precio base es 'price' (que representa la caja completa)
    const boxPrice = product.price || 0;
    const unitsPerBox = product.units_per_box || product.unit_count || 1;

    if (unitsPerBox <= 1) return boxPrice;

    // Calculamos el precio unitario base
    const rawUnitPrice = boxPrice / unitsPerBox;

    // Aplicamos redondeo al alza a la decena o 50 más cercano para no perder margen
    // Ejemplo: 333.33 -> 350
    return Math.ceil(rawUnitPrice / 50) * 50;
};
