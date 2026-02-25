import { describe, expect, it } from 'vitest';
import {
    getSaleItemQuantity,
    getSaleItemTotal,
    getSaleItemUnitPrice,
    getTransactionTitle
} from '@/presentation/components/pos/transaction-history-utils';

describe('transaction-history-utils', () => {
    it('usa unit_price cuando price no existe', () => {
        const unit = getSaleItemUnitPrice({
            quantity: 2,
            unit_price: 1552500
        });

        expect(unit).toBe(1552500);
    });

    it('calcula unitario desde total/quantity como fallback', () => {
        const unit = getSaleItemUnitPrice({
            quantity: 3,
            total_price: 9000
        });

        expect(unit).toBe(3000);
    });

    it('prioriza total explícito para subtotal de línea', () => {
        const total = getSaleItemTotal({
            quantity: 2,
            unit_price: 1000,
            total_price: 2500
        });

        expect(total).toBe(2500);
    });

    it('normaliza títulos para movimientos de apertura', () => {
        expect(getTransactionTitle({ type: 'OPENING' }, 'fallback')).toBe('Apertura de Caja');
        expect(getTransactionTitle({ type: 'APERTURA' }, 'fallback')).toBe('Apertura de Caja');
    });

    it('construye título de venta con folio o fallback', () => {
        expect(getTransactionTitle({ type: 'SALE', dte_folio: '12345' }, 'id-1')).toBe('Venta #12345');
        expect(getTransactionTitle({ type: 'SALE' }, 'id-2')).toBe('Venta #id-2');
    });

    it('parsea cantidad de forma segura', () => {
        expect(getSaleItemQuantity({ quantity: '4' })).toBe(4);
        expect(getSaleItemQuantity({ quantity: 0 })).toBe(0);
    });
});
