
import { describe, it, expect } from 'vitest';
import { calculateRecommendedPrice, applySmartRounding, calculateMargin } from './pricing-rules';

describe('Pricing Rules Logic', () => {

    describe('applySmartRounding (Regla 50/100)', () => {
        it('debe redondear hacia arriba al múltiplo de 50 más cercano', () => {
            expect(applySmartRounding(1001)).toBe(1050);
            expect(applySmartRounding(1049)).toBe(1050);
            expect(applySmartRounding(1050)).toBe(1050);
            expect(applySmartRounding(1051)).toBe(1100);
            expect(applySmartRounding(99)).toBe(100);
            expect(applySmartRounding(1)).toBe(50);
        });

        it('debe manejar 0 correctamente', () => {
            expect(applySmartRounding(0)).toBe(0);
        });
    });

    describe('calculateRecommendedPrice', () => {
        // Caso 1: Costo 1000, 40% Margen, Sin IVA (IVA ya incluido en costo o exento)
        // 1000 * 1.4 = 1400 -> Redondeo -> 1400
        it('calcula precio básico sin IVA extra', () => {
            const price = calculateRecommendedPrice(1000, false, 40);
            expect(price).toBe(1400);
        });

        // Caso 2: Costo 1000 + IVA, 40% Margen
        // Costo Base = 1000 * 1.19 = 1190
        // Precio = 1190 * 1.4 = 1666
        // Redondeo 1666 -> 1700
        it('calcula precio sumando IVA al costo', () => {
            const price = calculateRecommendedPrice(1000, true, 40);
            expect(price).toBe(1700);
        });

        // Caso 3: Costo 534, 30% Margen, Sin IVA
        // 534 * 1.3 = 694.2 -> Redondeo -> 700
        it('aplica redondeo 50/100 al resultado final', () => {
            const price = calculateRecommendedPrice(534, false, 30);
            expect(price).toBe(700);
        });
    });

    describe('calculateMargin', () => {
        it('calcula el margen inverso correctamente', () => {
            // Costo 1000, Precio 1400 -> (400/1000) = 40%
            expect(calculateMargin(1400, 1000, false)).toBe(40);
        });

        it('calcula el margen inverso considerando IVA', () => {
            // Costo 1000 (+19% = 1190), Precio 1700 
            // (1700 - 1190) / 1190 = 0.4285... -> 42.86%
            expect(calculateMargin(1700, 1000, true)).toBe(42.86);
        });
    });

});
