import { describe, expect, it } from 'vitest';

import { PUBLIC_PRICE_LABEL, buildPublicProductResult } from '@/actions/public/public-product-result';

describe('buildPublicProductResult', () => {
    it('oculta stock y precio exactos en el payload público', () => {
        const result = buildPublicProductResult({
            id: 'prod-1',
            name: 'Paracetamol 500mg',
            sku: 'PARA-500',
            stock: 17,
            laboratory: 'Lab',
            dci: 'Paracetamol',
            format: 'Caja',
        });

        expect(result.stock).toBeNull();
        expect(result.price).toBeNull();
        expect(result.availabilityStatus).toBe('Disponible');
        expect(result.priceLabel).toBe(PUBLIC_PRICE_LABEL);
    });
});
