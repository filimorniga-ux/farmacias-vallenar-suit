export const CANONICAL_SALE_CONDITIONS = ['VD', 'R', 'RR', 'RCH'] as const;

export type CanonicalSaleCondition = typeof CANONICAL_SALE_CONDITIONS[number];
export type PrescriptionSaleCondition = Exclude<CanonicalSaleCondition, 'VD'>;

const LEGACY_SALE_CONDITION_MAP: Record<string, CanonicalSaleCondition> = {
    VD: 'VD',
    R: 'R',
    RR: 'RR',
    RCH: 'RCH',
    LIBRE: 'VD',
    VENTA_DIRECTA: 'VD',
    RECETA_SIMPLE: 'R',
    RECETA_RETENIDA: 'RR',
    RECETA_CHEQUE: 'RCH',
};

export function normalizeSaleCondition(value: unknown): CanonicalSaleCondition {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return LEGACY_SALE_CONDITION_MAP[normalized] ?? 'VD';
}

export function getPrescriptionSaleCondition(value: unknown): PrescriptionSaleCondition | null {
    const condition = normalizeSaleCondition(value);
    return condition === 'VD' ? null : condition;
}
