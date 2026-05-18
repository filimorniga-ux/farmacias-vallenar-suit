import { describe, expect, it } from 'vitest';
import { buildSmartInvoicePaginationItems } from '@/lib/smart-invoice-pagination';

describe('smart invoice pagination', () => {
    it('muestra todas las paginas cuando el total es bajo', () => {
        expect(buildSmartInvoicePaginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('mantiene el inicio visible con elipsis hacia el final', () => {
        expect(buildSmartInvoicePaginationItems(1, 20)).toEqual([1, 2, 3, 4, 'ellipsis-end', 20]);
        expect(buildSmartInvoicePaginationItems(3, 20)).toEqual([1, 2, 3, 4, 'ellipsis-end', 20]);
    });

    it('mantiene la ventana central con extremos visibles', () => {
        expect(buildSmartInvoicePaginationItems(6, 20)).toEqual([
            1,
            'ellipsis-start',
            5,
            6,
            7,
            'ellipsis-end',
            20,
        ]);
    });

    it('mantiene el final visible con elipsis desde el inicio', () => {
        expect(buildSmartInvoicePaginationItems(19, 20)).toEqual([1, 'ellipsis-start', 17, 18, 19, 20]);
        expect(buildSmartInvoicePaginationItems(20, 20)).toEqual([1, 'ellipsis-start', 17, 18, 19, 20]);
    });

    it('normaliza paginas fuera de rango sin crear paginas invalidas', () => {
        expect(buildSmartInvoicePaginationItems(99, 10)).toEqual([1, 'ellipsis-start', 7, 8, 9, 10]);
        expect(buildSmartInvoicePaginationItems(-4, 10)).toEqual([1, 2, 3, 4, 'ellipsis-end', 10]);
        expect(buildSmartInvoicePaginationItems(1, 0)).toEqual([]);
    });
});
