/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UnifiedPriceConsultant from '@/components/procurement/UnifiedPriceConsultant';
import { searchUnifiedProducts } from '@/actions/analytics/price-arbitrage';
import type { UnifiedProduct } from '@/actions/analytics/price-arbitrage';

vi.mock('@/hooks/use-debounce', () => ({
    useDebounce: (value: string) => value,
}));

vi.mock('@/actions/public/get-filters', () => ({
    getFiltersAction: vi.fn(async () => ({
        categories: [],
        laboratories: [],
        actions: [],
    })),
}));

vi.mock('@/actions/analytics/price-arbitrage', () => ({
    searchUnifiedProducts: vi.fn(),
}));

describe('UnifiedPriceConsultant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(searchUnifiedProducts).mockResolvedValue([]);
    });

    it('usa contrato público y oculta el toggle cuando no puede ver precios internos', async () => {
        render(
            <UnifiedPriceConsultant
                isPublicMode={true}
                allowToggle={true}
                canViewInternalPricing={false}
            />
        );

        fireEvent.change(
            screen.getByPlaceholderText(/Buscar por nombre, código de barras o SKU/i),
            { target: { value: 'para' } },
        );

        await waitFor(() => {
            expect(searchUnifiedProducts).toHaveBeenCalledWith(
                'para',
                expect.any(Object),
                'PUBLIC',
            );
        });

        expect(screen.queryByText('Golan (Costo)')).toBeNull();
        expect(screen.queryByText('Margen')).toBeNull();
    });

    it('mantiene búsqueda, filtros y tabla contenidos para viewport móvil', async () => {
        const result: UnifiedProduct = {
            id: 'product-1',
            productName: 'Paracetamol 500 mg',
            ispCode: 'ISP-1',
            sku: 'SKU-1',
            activePrinciple: 'Paracetamol',
            misc: {
                category: 'Analgésico',
                laboratory: 'Lab Centro',
                bioequivalencia: true,
            },
            offerings: [
                { source: 'SANTIAGO', price: 1990, stock: 10, type: 'BRANCH' },
                { source: 'COLCHAGUA', price: 2090, stock: 4, type: 'BRANCH' },
                { source: 'GOLAN', price: 1200, stock: 20, type: 'PROVIDER' },
            ],
            bestPrice: 1990,
            highestPrice: 2090,
            maxMargin: 790,
            alerts: [],
            unitsPerBox: 10,
        };
        vi.mocked(searchUnifiedProducts).mockResolvedValue([result]);

        render(
            <UnifiedPriceConsultant
                isPublicMode={false}
                allowToggle={true}
                canViewInternalPricing={true}
            />
        );

        const toggle = screen.getByRole('button', { name: /ocultar costos internos/i });
        expect(toggle.className).toContain('min-h-11');
        expect(toggle.getAttribute('aria-pressed')).toBe('true');

        const input = screen.getByLabelText('Buscar producto en consultor de precios');
        expect(input.className).toContain('min-h-11');
        expect(input.getAttribute('autofocus')).toBeNull();

        const filtersButton = screen.getByRole('button', { name: 'Filtros' });
        expect(filtersButton.className).toContain('min-h-11');
        expect(filtersButton.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(filtersButton);

        expect(filtersButton.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Filtrar por categoría').className).toContain('min-h-11');
        expect(screen.getByLabelText('Filtrar por laboratorio').className).toContain('min-h-11');
        expect(screen.getByLabelText('Filtrar por acción terapéutica').className).toContain('min-h-11');

        fireEvent.change(input, { target: { value: 'para' } });

        await screen.findByText('Paracetamol 500 mg');
        const table = screen.getByRole('table');
        expect(table.className).toContain('min-w-[720px]');
        expect(table.parentElement?.className).toContain('overflow-x-auto');

        const activePrincipleButton = screen.getByRole('button', {
            name: 'Buscar alternativas con principio activo Paracetamol',
        });
        expect(activePrincipleButton.className).toContain('focus-visible:ring-2');

        fireEvent.click(activePrincipleButton);
        expect((input as HTMLInputElement).value).toBe('Paracetamol');

        await waitFor(() => {
            expect(searchUnifiedProducts).toHaveBeenCalledWith('Paracetamol', expect.any(Object), 'INTERNAL');
        });
    });
});
