import { InventoryBatch } from '../types';

export const formatProductLabel = (product: InventoryBatch): string => {
    // Format: [NOMBRE] - [DCI] [CONCENTRACION] - [FORMATO] x[UNIDADES] ([LAB])
    // Example: "Panadol - Paracetamol 500mg - Comprimidos x16 (GlaxoSmithKline)"

    const name = product.name;
    const dci = product.dci;
    const concentration = product.concentration;
    const format = product.format;
    const units = product.unit_count;
    const lab = product.laboratory;

    return `${name} - ${dci} ${concentration} - ${format} x${units} (${lab})`;
};

export const calculatePricePerUnit = (product: InventoryBatch): number => {
    if (!product.unit_count || product.unit_count === 0) return 0;
    return product.price / product.unit_count;
};
