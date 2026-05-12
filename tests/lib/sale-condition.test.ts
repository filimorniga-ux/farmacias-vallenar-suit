import { describe, expect, it } from 'vitest';
import {
    getPrescriptionSaleCondition,
    normalizeSaleCondition,
} from '@/lib/sale-condition';

describe('sale condition normalization', () => {
    it.each([
        ['VD', 'VD'],
        ['R', 'R'],
        ['RR', 'RR'],
        ['RCH', 'RCH'],
        ['LIBRE', 'VD'],
        ['VENTA_DIRECTA', 'VD'],
        ['RECETA_SIMPLE', 'R'],
        ['RECETA_RETENIDA', 'RR'],
        ['RECETA_CHEQUE', 'RCH'],
        ['valor-desconocido', 'VD'],
        [null, 'VD'],
    ])('normaliza %s a %s', (input, expected) => {
        expect(normalizeSaleCondition(input)).toBe(expected);
    });

    it.each([
        ['VD', null],
        ['R', 'R'],
        ['RR', 'RR'],
        ['RCH', 'RCH'],
        ['RECETA_RETENIDA', 'RR'],
        ['desconocido', null],
    ])('resuelve condición de receta %s como %s', (input, expected) => {
        expect(getPrescriptionSaleCondition(input)).toBe(expected);
    });
});
