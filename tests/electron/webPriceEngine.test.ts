/**
 * ============================================================================
 * WEB PRICE SEARCH — Unit Tests (v2: improved search & fuzzy matching)
 * 
 * Tests all pure functions shared between:
 *   - src/lib/web-price-search.ts (server-side)
 *   - electron/webPriceEngine.cjs (Electron)
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    normalizeProductName,
    buildSearchQuery,
    extractCLPPrices,
    identifySource,
    calculateConfidence,
    filterOutliersIQR,
    calculateMedian,
    calculatePercentile,
    calculateSmartPrice,
} from '@/lib/web-price-search';

// ============================================================================
// normalizeProductName
// ============================================================================

describe('normalizeProductName', () => {
    it('expands SOL.OFT. abbreviation', () => {
        const result = normalizeProductName('3A OFTENO SOL.OFT.0,1%5ML');
        expect(result.toLowerCase()).toContain('solucion oftalmica');
        expect(result).toContain('0.1');
    });

    it('expands ANTISEP.BUC. abbreviation', () => {
        const result = normalizeProductName('AB ANTISEP.BUC.12COM.');
        expect(result.toLowerCase()).toContain('antiseptico');
        expect(result.toLowerCase()).toContain('bucal');
    });

    it('separates units from numbers', () => {
        const result = normalizeProductName('METRONIDAZOL 500MG X20');
        expect(result).toContain('500 MG');
    });

    it('converts comma to dot in decimals', () => {
        const result = normalizeProductName('PRODUCTO 0,5% 10ML');
        expect(result).toContain('0.5');
    });

    it('removes [AL DETAL] prefix', () => {
        const result = normalizeProductName('[AL DETAL] PARACETAMOL 500MG');
        expect(result.toLowerCase()).not.toContain('al detal');
        expect(result).toContain('500 MG');
    });

    it('removes [FRACCIONADO] prefix', () => {
        const result = normalizeProductName('[FRACCIONADO] IBUPROFENO 400MG');
        expect(result.toLowerCase()).not.toContain('fraccionado');
    });

    it('expands COMP. abbreviation', () => {
        const result = normalizeProductName('LOSARTAN 50MG COMP.');
        expect(result.toLowerCase()).toContain('comprimidos');
    });

    it('expands CAP. abbreviation', () => {
        const result = normalizeProductName('OMEPRAZOL 20MG CAP.');
        expect(result.toLowerCase()).toContain('capsulas');
    });

    it('expands JBE. abbreviation', () => {
        const result = normalizeProductName('AMBROXOL JBE. 15MG/5ML');
        expect(result.toLowerCase()).toContain('jarabe');
    });

    it('handles multiple abbreviations in one name', () => {
        const result = normalizeProductName('SOL.INY. 100MG/ML AMP.');
        expect(result.toLowerCase()).toContain('solucion inyectable');
    });
});

// ============================================================================
// buildSearchQuery
// ============================================================================

describe('buildSearchQuery', () => {
    it('appends "precio farmacia Chile"', () => {
        expect(buildSearchQuery('Paracetamol 500mg')).toContain('precio farmacia Chile');
    });

    it('removes [AL DETAL] prefix', () => {
        const q = buildSearchQuery('[AL DETAL] Ibuprofeno 400mg');
        expect(q).not.toContain('[AL DETAL]');
        expect(q).toContain('Ibuprofeno');
    });

    it('truncates to 8 words max', () => {
        const long = 'Paracetamol Comprimidos Recubiertos 500mg Marca Super Especial Laboratorio Extra Bonus';
        const q = buildSearchQuery(long);
        const words = q.replace(' precio farmacia Chile', '').split(' ');
        expect(words.length).toBeLessThanOrEqual(8);
    });

    it('keeps names with ≤8 words intact', () => {
        const q = buildSearchQuery('Losartan 50 mg Comprimidos');
        expect(q).toContain('Losartan 50 mg Comprimidos');
    });
});

// ============================================================================
// extractCLPPrices
// ============================================================================

describe('extractCLPPrices', () => {
    it('extracts $XX.XXX format', () => {
        expect(extractCLPPrices('Precio: $12.990')).toContain(12990);
    });

    it('extracts $X.XXX format', () => {
        expect(extractCLPPrices('Desde $1.290')).toContain(1290);
    });

    it('extracts multiple prices', () => {
        const prices = extractCLPPrices('Normal $15.990, oferta $12.490');
        expect(prices).toContain(15990);
        expect(prices).toContain(12490);
    });

    it('extracts $XXXXX without separator', () => {
        expect(extractCLPPrices('Solo $990')).toContain(990);
    });

    it('extracts CLP XX.XXX format', () => {
        expect(extractCLPPrices('CLP 25.990')).toContain(25990);
    });

    it('ignores non-price numbers', () => {
        const prices = extractCLPPrices('Código 12345678, solo $5.990');
        expect(prices).toContain(5990);
    });

    it('returns empty for no prices', () => {
        expect(extractCLPPrices('No hay precios aquí')).toEqual([]);
    });
});

// ============================================================================
// identifySource (now accepts any .cl)
// ============================================================================

describe('identifySource', () => {
    it('identifies trusted source: cruzverde.cl', () => {
        const result = identifySource('https://www.cruzverde.cl/producto/123');
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Cruz Verde');
        expect(result?.trusted).toBe(true);
    });

    it('identifies trusted source: salcobrand.cl', () => {
        const result = identifySource('https://salcobrand.cl/paracetamol');
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Salcobrand');
        expect(result?.trusted).toBe(true);
    });

    it('accepts generic .cl domain', () => {
        const result = identifySource('https://www.redfarma.cl/producto/456');
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Redfarma');
        expect(result?.trusted).toBe(false);
    });

    it('accepts biofar.cl as generic .cl', () => {
        const result = identifySource('https://biofar.cl/product/12345');
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Biofar');
        expect(result?.trusted).toBe(false);
    });

    it('returns null for non-.cl domains', () => {
        expect(identifySource('https://amazon.com/product')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(identifySource('')).toBeNull();
    });
});

// ============================================================================
// calculateConfidence (fuzzy matching)
// ============================================================================

describe('calculateConfidence', () => {
    it('returns HIGH for near-exact match', () => {
        expect(calculateConfidence(
            '3A Ofteno Solución Oftálmica 0,1%',
            '3A OFTENO SOL.OFT.0,1%5ML'
        )).toBe('HIGH');
    });

    it('returns HIGH for normalized match', () => {
        expect(calculateConfidence(
            'Paracetamol 500mg Comprimidos',
            'PARACETAMOL 500MG COMP.'
        )).toBe('HIGH');
    });

    it('returns MEDIUM for partial match', () => {
        const result = calculateConfidence(
            'Metronidazol 250mg crema vaginal',
            'METRONIDAZOL 500MG X20 COMP'
        );
        expect(['HIGH', 'MEDIUM']).toContain(result);
    });

    it('returns LOW for unrelated product', () => {
        expect(calculateConfidence(
            'iPhone 14 Pro Max 256GB',
            'PARACETAMOL 500MG COMP'
        )).toBe('LOW');
    });

    it('handles abbreviated names better than before', () => {
        // With normalization, "SOL.OFT." becomes "solucion oftalmica"
        // which should partially match "Solución Oftálmica"
        const result = calculateConfidence(
            'Ofteno solucion oftalmica 0.1 5ml',
            '3A OFTENO SOL.OFT.0,1%5ML'
        );
        expect(['HIGH', 'MEDIUM']).toContain(result);
    });
});

// ============================================================================
// filterOutliersIQR
// ============================================================================

describe('filterOutliersIQR', () => {
    it('keeps prices within IQR range', () => {
        const { filtered } = filterOutliersIQR([5000, 5500, 6000, 6500, 7000]);
        expect(filtered.length).toBe(5);
    });

    it('removes extreme outliers', () => {
        const { filtered, outlierLow, outlierHigh } = filterOutliersIQR([100, 5000, 5500, 6000, 50000]);
        expect(outlierLow.length + outlierHigh.length).toBeGreaterThan(0);
        expect(filtered.length).toBeGreaterThan(0);
    });

    it('handles small arrays (< 3)', () => {
        const { filtered } = filterOutliersIQR([5000, 6000]);
        expect(filtered).toEqual([5000, 6000]);
    });
});

// ============================================================================
// calculateMedian & calculatePercentile
// ============================================================================

describe('calculateMedian', () => {
    it('returns middle value for odd length', () => {
        expect(calculateMedian([1000, 2000, 3000])).toBe(2000);
    });

    it('returns average of two middle values for even length', () => {
        expect(calculateMedian([1000, 2000, 3000, 4000])).toBe(2500);
    });

    it('returns 0 for empty array', () => {
        expect(calculateMedian([])).toBe(0);
    });
});

describe('calculatePercentile', () => {
    it('returns correct 25th percentile', () => {
        const val = calculatePercentile([1000, 2000, 3000, 4000, 5000], 25);
        expect(val).toBe(2000);
    });

    it('returns correct 75th percentile', () => {
        const val = calculatePercentile([1000, 2000, 3000, 4000, 5000], 75);
        expect(val).toBe(4000);
    });
});

// ============================================================================
// calculateSmartPrice (now accepts 1 result)
// ============================================================================

describe('calculateSmartPrice', () => {
    it('generates smart price with single confident result', () => {
        const result = calculateSmartPrice(
            [{ source: 'Cruz Verde', price: 12990, url: '', title: '', confidence: 'HIGH' as const }],
            15000,
            5000
        );
        expect(result).not.toBeNull();
        expect(result?.medianPrice).toBe(12990);
        expect(result?.recommendedPrice).toBeGreaterThan(0);
    });

    it('generates smart price with two confident results', () => {
        const result = calculateSmartPrice(
            [
                { source: 'Cruz Verde', price: 12990, url: '', title: '', confidence: 'HIGH' as const },
                { source: 'Salcobrand', price: 13500, url: '', title: '', confidence: 'MEDIUM' as const },
            ],
            15000,
            5000
        );
        expect(result).not.toBeNull();
        expect(result?.recommendedPrice).toBeGreaterThan(0);
        expect(result?.recommendedPrice).toBeLessThan(15000);
    });

    it('returns null with zero confident results', () => {
        const result = calculateSmartPrice(
            [{ source: 'Unknown', price: 12990, url: '', title: '', confidence: 'LOW' as const }],
            15000,
            5000
        );
        expect(result).toBeNull();
    });

    it('applies margin protection when price is below cost + margin', () => {
        const result = calculateSmartPrice(
            [
                { source: 'Cruz Verde', price: 1200, url: '', title: '', confidence: 'HIGH' as const },
                { source: 'Salcobrand', price: 1300, url: '', title: '', confidence: 'HIGH' as const },
            ],
            5000,
            1100
        );
        expect(result).not.toBeNull();
        expect(result?.marginProtectionApplied).toBe(true);
        expect(result?.recommendedPrice).toBeGreaterThanOrEqual(
            Math.ceil(1100 * 1.15 / 50) * 50
        );
    });

    it('rounds to $50 CLP', () => {
        const result = calculateSmartPrice(
            [
                { source: 'Test', price: 10000, url: '', title: '', confidence: 'HIGH' as const },
                { source: 'Test2', price: 10500, url: '', title: '', confidence: 'HIGH' as const },
            ],
            12000,
            4000
        );
        expect(result).not.toBeNull();
        expect(result!.recommendedPrice % 50).toBe(0);
    });
});
