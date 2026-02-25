import { describe, expect, it } from 'vitest';
import { resolveTransferQuantity } from '@/presentation/components/supply/transfer-suggestions-utils';

describe('transfer-suggestions-utils', () => {
    it('usa sugerido por defecto limitado por disponible', () => {
        const quantity = resolveTransferQuantity({
            suggestedQty: 42,
            availableQty: 20
        });

        expect(quantity).toBe(20);
    });

    it('usa cantidad editada cuando está dentro de rango', () => {
        const quantity = resolveTransferQuantity({
            requestedQty: 15,
            suggestedQty: 42,
            availableQty: 20
        });

        expect(quantity).toBe(15);
    });

    it('acota cantidad editada al disponible', () => {
        const quantity = resolveTransferQuantity({
            requestedQty: 120,
            suggestedQty: 42,
            availableQty: 20
        });

        expect(quantity).toBe(20);
    });

    it('devuelve cero cuando no hay disponible', () => {
        const quantity = resolveTransferQuantity({
            requestedQty: 5,
            suggestedQty: 42,
            availableQty: 0
        });

        expect(quantity).toBe(0);
    });
});

