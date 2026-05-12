/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductFormModal from '@/presentation/components/inventory/ProductFormModal';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        suppliers: [],
        currentLocationId: 'loc-1',
        user: { id: '11111111-1111-4111-8111-111111111111' },
    };

    const locationState = {
        locations: [{ id: 'loc-1', name: 'Sucursal Centro', type: 'STORE' }],
    };

    return {
        pharmaState,
        locationState,
    };
});

vi.mock('next/dynamic', () => ({
    __esModule: true,
    default: () => () => null,
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector?: (state: typeof mocks.pharmaState) => unknown) =>
        selector ? selector(mocks.pharmaState) : mocks.pharmaState,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector?: (state: typeof mocks.locationState) => unknown) =>
        selector ? selector(mocks.locationState) : mocks.locationState,
}));

vi.mock('@/actions/products-v2', () => ({
    createProductSecure: vi.fn(),
    updateProductMasterSecure: vi.fn(),
}));

vi.mock('@/infrastructure/services/BarcodeLookupService', () => ({
    lookupBarcode: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

function renderProductFormModal() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <ProductFormModal
                initialValues={{
                    sku: 'SKU-001',
                    name: 'Producto maestro con nombre largo para móvil',
                    cost: 1200,
                    price: 1990,
                }}
                onClose={vi.fn()}
            />
        </QueryClientProvider>
    );
}

describe('ProductFormModal mobile layout', () => {
    it('mantiene safe areas, grillas responsivas y acciones táctiles en móvil', () => {
        renderProductFormModal();

        const modal = screen.getByRole('dialog', { name: /Nuevo Producto Maestro/i });
        expect(modal).toBe(screen.getByTestId('product-form-modal'));
        expect(modal.className).toContain('h-[calc(100dvh-1rem)]');
        expect(modal.className).toContain('max-h-[calc(100dvh-1rem)]');
        expect(modal.className).toContain('overflow-hidden');
        expect(modal.parentElement?.className).toContain('safe-area-inset-top');
        expect(modal.parentElement?.className).toContain('safe-area-inset-bottom');

        const title = screen.getByRole('heading', { name: /Nuevo Producto Maestro/i });
        expect(title.className).toContain('text-lg');
        expect(title.className).toContain('sm:text-2xl');

        const skuInput = screen.getByDisplayValue('SKU-001');
        const identityGrid = skuInput.closest('.grid');
        expect(identityGrid?.className).toContain('grid-cols-1');
        expect(identityGrid?.className).toContain('sm:grid-cols-2');

        expect(screen.getByRole('button', { name: /Escanear código de barras/i }).className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: /Cerrar formulario de producto/i }).className).toContain('min-h-11');

        const footer = screen.getByRole('button', { name: /Crear Producto Maestro/i }).parentElement;
        expect(footer?.className).toContain('flex-col-reverse');
        expect(footer?.className).toContain('sm:flex-row');
        expect(screen.getByRole('button', { name: /Crear Producto Maestro/i }).className).toContain('min-h-11');
    });
});
