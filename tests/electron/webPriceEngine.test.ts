/**
 * ============================================================================
 * WEB PRICE SEARCH — Unit Tests
 * 
 * Tests all pure functions shared between:
 *   - src/lib/web-price-search.ts (server-side)
 *   - electron/webPriceEngine.cjs (Electron, identical copies)
 * 
 * Functions tested:
 *   - buildSearchQuery
 *   - extractCLPPrices
 *   - identifySource
 *   - calculateConfidence
 *   - filterOutliersIQR
 *   - calculateMedian / calculatePercentile
 *   - calculateSmartPrice
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    buildSearchQuery,
    extractCLPPrices,
    identifySource,
    calculateConfidence,
    filterOutliersIQR,
    calculateMedian,
    calculatePercentile,
    calculateSmartPrice,
} from '@/lib/web-price-search';
import type { WebPriceResult } from '@/lib/web-price-search';

// ============================================================================
// buildSearchQuery
// ============================================================================

describe('buildSearchQuery', () => {
    it('should build query from simple product name', () => {
        expect(buildSearchQuery('Paracetamol 500mg'))
            .toBe('Paracetamol 500mg precio farmacia Chile');
    });

    it('should strip [AL DETAL] prefix', () => {
        expect(buildSearchQuery('[AL DETAL] Ibuprofeno 400mg'))
            .toBe('Ibuprofeno 400mg precio farmacia Chile');
    });

    it('should strip [FRACCIONADO] prefix', () => {
        expect(buildSearchQuery('[FRACCIONADO] Amoxicilina 500mg'))
            .toBe('Amoxicilina 500mg precio farmacia Chile');
    });

    it('should truncate names longer than 6 words', () => {
        expect(buildSearchQuery('Marca Producto Farmaco Generico Extra Largo Demasiado'))
            .toBe('Marca Producto Farmaco Generico Extra Largo precio farmacia Chile');
    });

    it('should collapse multiple spaces', () => {
        expect(buildSearchQuery('Losartan   50mg   Comp'))
            .toBe('Losartan 50mg Comp precio farmacia Chile');
    });
});

// ============================================================================
// extractCLPPrices
// ============================================================================

describe('extractCLPPrices', () => {
    it('should extract $XX.XXX format prices', () => {
        const result = extractCLPPrices('precio $12.990 en oferta $5.490');
        expect(result).toContain(12990);
        expect(result).toContain(5490);
    });

    it('should extract $XXXXX format (no separator)', () => {
        const result = extractCLPPrices('precio $990 en oferta');
        expect(result).toContain(990);
    });

    it('should extract CLP format', () => {
        const result = extractCLPPrices('CLP 14.990 disponible');
        expect(result).toContain(14990);
    });

    it('should return empty for text without prices', () => {
        expect(extractCLPPrices('Sin precios')).toEqual([]);
    });

    it('should handle large prices ($450.000)', () => {
        const result = extractCLPPrices('$450.000 por caja completa');
        expect(result).toContain(450000);
    });

    it('should handle $1.000 range', () => {
        const result = extractCLPPrices('Paracetamol desde $1.290');
        expect(result).toContain(1290);
    });
});

// ============================================================================
// identifySource
// ============================================================================

describe('identifySource', () => {
    it('should identify Cruz Verde', () => {
        expect(identifySource('https://www.cruzverde.cl/producto/123'))
            .toEqual({ name: 'Cruz Verde', domain: 'cruzverde.cl' });
    });

    it('should identify Salcobrand', () => {
        expect(identifySource('https://salcobrand.cl/producto/ibuprofeno'))
            .toEqual({ name: 'Salcobrand', domain: 'salcobrand.cl' });
    });

    it('should identify Yapp', () => {
        expect(identifySource('https://yapp.cl/med'))
            .toEqual({ name: 'Yapp', domain: 'yapp.cl' });
    });

    it('should return null for unknown domains', () => {
        expect(identifySource('https://amazon.com/product')).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(identifySource('')).toBeNull();
    });
});

// ============================================================================
// calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
    it('should return HIGH when most words match', () => {
        expect(calculateConfidence(
            'Paracetamol 500mg Comprimidos Laboratorio Chile',
            'Paracetamol 500mg Comprimidos Laboratorio Chile'
        )).toBe('HIGH');
    });

    it('should return MEDIUM when some words match', () => {
        expect(calculateConfidence(
            'Paracetamol 500mg tabletas genérico',
            'Paracetamol 500mg Comprimidos Laboratorio Chile'
        )).toBe('MEDIUM');
    });

    it('should return LOW when few words match', () => {
        expect(calculateConfidence(
            'Aspirina efervescente limón',
            'Paracetamol 500mg Comprimidos'
        )).toBe('LOW');
    });

    it('should strip [AL DETAL] prefix in product name', () => {
        const result = calculateConfidence(
            'Amoxicilina 500mg cápsula',
            '[AL DETAL] Amoxicilina 500mg cápsula genérica'
        );
        expect(['HIGH', 'MEDIUM']).toContain(result);
    });
});

// ============================================================================
// filterOutliersIQR
// ============================================================================

describe('filterOutliersIQR', () => {
    it('should not filter with < 3 prices', () => {
        const result = filterOutliersIQR([1000, 2000]);
        expect(result.filtered).toEqual([1000, 2000]);
        expect(result.outlierLow).toEqual([]);
        expect(result.outlierHigh).toEqual([]);
    });

    it('should filter extreme high outliers', () => {
        const result = filterOutliersIQR([10000, 11000, 12000, 12500, 50000]);
        expect(result.outlierHigh).toContain(50000);
        expect(result.filtered).not.toContain(50000);
    });

    it('should filter low outliers (flash sales)', () => {
        const result = filterOutliersIQR([100, 10000, 11000, 12000, 13000]);
        expect(result.outlierLow).toContain(100);
        expect(result.filtered).not.toContain(100);
    });

    it('should handle all same prices', () => {
        const result = filterOutliersIQR([5000, 5000, 5000, 5000]);
        expect(result.filtered.length).toBeGreaterThan(0);
    });

    it('should always return at least some values', () => {
        const result = filterOutliersIQR([100, 200, 300]);
        expect(result.filtered.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// calculateMedian
// ============================================================================

describe('calculateMedian', () => {
    it('should return middle value for odd length', () => {
        expect(calculateMedian([1000, 2000, 3000])).toBe(2000);
    });

    it('should return average of middle two for even length', () => {
        expect(calculateMedian([1000, 2000, 3000, 4000])).toBe(2500);
    });

    it('should return 0 for empty array', () => {
        expect(calculateMedian([])).toBe(0);
    });

    it('should return single element for length 1', () => {
        expect(calculateMedian([5000])).toBe(5000);
    });
});

// ============================================================================
// calculatePercentile
// ============================================================================

describe('calculatePercentile', () => {
    it('should return min for 0th percentile', () => {
        expect(calculatePercentile([1000, 2000, 3000, 4000], 0)).toBe(1000);
    });

    it('should return max for 100th percentile', () => {
        expect(calculatePercentile([1000, 2000, 3000, 4000], 100)).toBe(4000);
    });

    it('should return 0 for empty array', () => {
        expect(calculatePercentile([], 50)).toBe(0);
    });

    it('should calculate Q1', () => {
        expect(calculatePercentile([1000, 2000, 3000, 4000, 5000], 25)).toBe(2000);
    });
});

// ============================================================================
// calculateSmartPrice
// ============================================================================

describe('calculateSmartPrice', () => {
    const makeResult = (price: number, confidence: 'HIGH' | 'MEDIUM' | 'LOW'): WebPriceResult => ({
        price,
        confidence,
        source: 'Test',
        url: '',
        title: '',
    });

    it('should return null with < 2 confident results', () => {
        expect(calculateSmartPrice([makeResult(5000, 'LOW')], 5000, 3000)).toBeNull();
    });

    it('should return null with only 1 confident result', () => {
        expect(calculateSmartPrice(
            [makeResult(5000, 'HIGH'), makeResult(6000, 'LOW')],
            5000, 3000
        )).toBeNull();
    });

    it('should calculate smart price with 3 valid results', () => {
        const results = [
            makeResult(10000, 'HIGH'),
            makeResult(11000, 'HIGH'),
            makeResult(12000, 'MEDIUM'),
        ];
        const sp = calculateSmartPrice(results, 10000, 5000);
        expect(sp).not.toBeNull();
        expect(sp!.medianPrice).toBe(11000);
        // median * 0.97 = 10670 → ceil to $50 = 10700
        expect(sp!.recommendedPrice).toBe(10700);
        expect(sp!.marginProtectionApplied).toBe(false);
    });

    it('should apply margin protection when recommended < cost + 15%', () => {
        const results = [
            makeResult(1000, 'HIGH'),
            makeResult(1100, 'HIGH'),
            makeResult(1200, 'MEDIUM'),
        ];
        // costPrice=2000 → minAllowed = 2300
        const sp = calculateSmartPrice(results, 3000, 2000);
        expect(sp).not.toBeNull();
        expect(sp!.marginProtectionApplied).toBe(true);
        expect(sp!.recommendedPrice).toBeGreaterThanOrEqual(2300);
    });

    it('should always round to $50 CLP', () => {
        const results = [
            makeResult(10000, 'HIGH'),
            makeResult(10500, 'HIGH'),
        ];
        const sp = calculateSmartPrice(results, 10000, 3000);
        expect(sp).not.toBeNull();
        expect(sp!.recommendedPrice % 50).toBe(0);
    });

    it('should ignore LOW confidence results', () => {
        const results = [
            makeResult(10000, 'HIGH'),
            makeResult(500, 'LOW'),  // should be ignored
            makeResult(11000, 'MEDIUM'),
        ];
        const sp = calculateSmartPrice(results, 10000, 5000);
        expect(sp).not.toBeNull();
        // If LOW was included, median would be much lower
        expect(sp!.medianPrice).toBeGreaterThan(5000);
    });

    it('should apply 3% competitive discount by default', () => {
        const results = [
            makeResult(10000, 'HIGH'),
            makeResult(10000, 'HIGH'),
        ];
        const sp = calculateSmartPrice(results, 12000, 3000);
        expect(sp).not.toBeNull();
        expect(sp!.competitiveDiscountPercent).toBe(3);
        // recommended = 10000 * 0.97 = 9700
        expect(sp!.recommendedPrice).toBe(9700);
    });

    it('should report outliers in result', () => {
        const results = [
            makeResult(100, 'HIGH'),     // outlier low
            makeResult(10000, 'HIGH'),
            makeResult(11000, 'HIGH'),
            makeResult(12000, 'MEDIUM'),
            makeResult(50000, 'MEDIUM'),  // outlier high
        ];
        const sp = calculateSmartPrice(results, 10000, 3000);
        expect(sp).not.toBeNull();
        // At least some outliers should be detected
        const totalOutliers = sp!.outlierLowPrices.length + sp!.outlierHighPrices.length;
        expect(totalOutliers).toBeGreaterThanOrEqual(1);
    });
});
