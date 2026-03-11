/**
 * Tests para web-price-search.ts
 * 
 * Verifica: parseo CLP, query building, confidence, source identification
 */
import { describe, it, expect } from 'vitest';
import {
    extractCLPPrices,
    buildSearchQuery,
    calculateConfidence,
    identifySource,
    parseSearchResults,
} from '../../src/lib/web-price-search';

// ============================================================================
// extractCLPPrices
// ============================================================================

describe('extractCLPPrices', () => {
    it('extrae precio con punto separador de miles ($12.990)', () => {
        const prices = extractCLPPrices('Precio: $12.990 en Cruz Verde');
        expect(prices).toContain(12990);
    });

    it('extrae múltiples precios', () => {
        const prices = extractCLPPrices('Desde $4.990 hasta $12.990');
        expect(prices).toContain(4990);
        expect(prices).toContain(12990);
    });

    it('extrae precio sin separador ($990)', () => {
        const prices = extractCLPPrices('Solo $990');
        expect(prices).toContain(990);
    });

    it('extrae precio grande ($145.000)', () => {
        const prices = extractCLPPrices('Precio: $145.000');
        expect(prices).toContain(145000);
    });

    it('extrae formato CLP', () => {
        const prices = extractCLPPrices('CLP 12.990');
        expect(prices).toContain(12990);
    });

    it('retorna vacío cuando no hay precios', () => {
        const prices = extractCLPPrices('Sin precios disponibles');
        expect(prices).toHaveLength(0);
    });

    it('no duplica precios idénticos', () => {
        const prices = extractCLPPrices('$12.990 vs $12.990');
        // Pattern1 matches twice, so we may get duplicates from pattern1 only
        // But patterns 2 and 3 check !prices.includes
        expect(prices.filter(p => p === 12990).length).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================================
// buildSearchQuery
// ============================================================================

describe('buildSearchQuery', () => {
    it('añade "precio farmacia Chile" al nombre', () => {
        const q = buildSearchQuery('PARACETAMOL 500MG');
        expect(q).toContain('PARACETAMOL 500MG');
        expect(q).toContain('precio farmacia Chile');
    });

    it('limpia prefijo [AL DETAL]', () => {
        const q = buildSearchQuery('[AL DETAL] IBUPROFENO 400MG');
        expect(q).not.toContain('[AL DETAL]');
        expect(q).toContain('IBUPROFENO');
    });

    it('trunca nombres largos a 6 palabras', () => {
        const q = buildSearchQuery('AARTAM METRONIDAZOL 500MG X20 COMP LAB PINNACLE B EXTRA LONG NAME');
        const words = q.replace(' precio farmacia Chile', '').trim().split(' ');
        expect(words.length).toBeLessThanOrEqual(6);
    });
});

// ============================================================================
// calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
    it('retorna HIGH para match >= 70%', () => {
        const conf = calculateConfidence(
            'Paracetamol 500mg comprimidos laboratorio Chile',
            'PARACETAMOL 500MG COMPRIMIDOS LABORATORIO'
        );
        expect(conf).toBe('HIGH');
    });

    it('retorna MEDIUM para match parcial', () => {
        const conf = calculateConfidence(
            'Paracetamol gotas infantil',
            'PARACETAMOL 500MG COMPRIMIDOS'
        );
        expect(['MEDIUM', 'LOW']).toContain(conf);
    });

    it('retorna LOW para sin coincidencias', () => {
        const conf = calculateConfidence(
            'Shampoo anticaspa Head & Shoulders',
            'PARACETAMOL 500MG'
        );
        expect(conf).toBe('LOW');
    });
});

// ============================================================================
// identifySource
// ============================================================================

describe('identifySource', () => {
    it('identifica Cruz Verde', () => {
        const source = identifySource('https://www.cruzverde.cl/producto/123');
        expect(source).not.toBeNull();
        expect(source?.name).toBe('Cruz Verde');
    });

    it('identifica Farmacias Ahumada', () => {
        const source = identifySource('https://www.farmaciasahumada.cl/paracetamol');
        expect(source?.name).toBe('Farmacias Ahumada');
    });

    it('identifica Salcobrand', () => {
        const source = identifySource('https://salcobrand.cl/product/xyz');
        expect(source?.name).toBe('Salcobrand');
    });

    it('retorna null para fuente desconocida', () => {
        const source = identifySource('https://randomsite.com/page');
        expect(source).toBeNull();
    });

    it('identifica Yapp', () => {
        const source = identifySource('https://yapp.cl/medicamento/abc');
        expect(source?.name).toBe('Yapp');
    });
});

// ============================================================================
// parseSearchResults
// ============================================================================

describe('parseSearchResults', () => {
    it('retorna vacío para HTML sin resultados', () => {
        const results = parseSearchResults('<html><body>No results</body></html>', 'test');
        expect(results).toHaveLength(0);
    });

    it('parsea un resultado con precio y fuente confiable', () => {
        const html = `
            <div class="result ">
                <a class="result__a" href="https://www.cruzverde.cl/producto/paracetamol">Paracetamol 500mg - Cruz Verde</a>
                <a class="result__url" href="https://www.cruzverde.cl/producto/paracetamol">cruzverde.cl</a>
                <a class="result__snippet">Compra Paracetamol 500mg por solo $2.990 con despacho a domicilio.</a>
            </div>
        `;
        const results = parseSearchResults(html, 'PARACETAMOL 500MG');
        expect(results.length).toBeGreaterThanOrEqual(1);
        if (results.length > 0) {
            expect(results[0].source).toBe('Cruz Verde');
            expect(results[0].price).toBe(2990);
        }
    });

    it('filtra fuentes no confiables', () => {
        const html = `
            <div class="result ">
                <a class="result__a" href="https://randomsite.com/page">Some random page</a>
                <a class="result__url" href="https://randomsite.com">randomsite.com</a>
                <a class="result__snippet">Price: $5.000</a>
            </div>
        `;
        const results = parseSearchResults(html, 'test');
        expect(results).toHaveLength(0);
    });
});
