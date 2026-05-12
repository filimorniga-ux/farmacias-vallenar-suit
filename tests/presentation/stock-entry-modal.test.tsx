/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockEntryModal from '@/presentation/components/inventory/StockEntryModal';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        inventory: [],
        updateStock: vi.fn(),
        addNewProduct: vi.fn(),
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
        suppliers: [],
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    const locationState = {
        locations: [{ id: 'loc-1', name: 'Sucursal Test', default_warehouse_id: 'wh-1', is_active: true }],
        fetchLocations: vi.fn(),
    };

    return {
        usePharmaStoreMock,
        locationState,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector: (state: typeof mocks.locationState) => unknown) => selector(mocks.locationState),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true }),
}));

vi.mock('@/presentation/components/ui/CameraScanner', () => ({
    __esModule: true,
    default: () => <div data-testid="camera-scanner">camera</div>,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

describe('StockEntryModal', () => {
    const renderModal = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <StockEntryModal isOpen={true} onClose={vi.fn()} />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mantiene shell y grillas móviles sin columnas implícitas', () => {
        renderModal();

        const modal = screen.getByRole('dialog', { name: /Ingreso Rápido de Stock/i });
        expect(modal).toBe(screen.getByTestId('stock-entry-modal'));
        expect(modal.className).toContain('h-[calc(100dvh-1rem)]');
        expect(modal.className).toContain('max-h-[calc(100dvh-1rem)]');
        expect(modal.parentElement?.className).toContain('safe-area-inset-top');
        expect(modal.parentElement?.className).toContain('safe-area-inset-bottom');
        expect(screen.getByTestId('stock-entry-modal-content').className).toContain('flex-1');
        expect(screen.getByRole('button', { name: /Buscar producto escaneado/i }).className).toContain('min-h-11');

        fireEvent.click(screen.getByRole('button', { name: /Crear Producto Maestro/i }));

        const identificationGrid = screen.getByTestId('stock-entry-new-product-identification-grid');
        expect(identificationGrid.className).toContain('grid-cols-1');
        expect(identificationGrid.className).toContain('sm:grid-cols-12');
        expect(screen.getByRole('button', { name: /Crear Ficha e Ingresar Stock/i }).className).toContain('min-h-11');
    });

    it('carga la cámara solo cuando el usuario abre el flujo explícito', async () => {
        renderModal();

        expect(screen.queryByTestId('camera-scanner')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /escanear con cámara/i }));

        expect(await screen.findByTestId('camera-scanner')).not.toBeNull();
    });

    it('usa el snapshot de inventario recibido por props para resolver el SKU escaneado', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        const inventoryItems = [{
            id: 'batch-1',
            sku: 'SKU-123',
            name: 'Paracetamol',
            location_id: 'loc-1',
            stock_actual: 10,
            stock_min: 1,
            stock_max: 50,
            expiry_date: Date.now(),
            cost_net: 100,
            tax_percent: 19,
            price_sell_box: 200,
            price_sell_unit: 20,
            price: 200,
            cost_price: 100,
            category: 'MEDICAMENTO',
            allows_commission: false,
            active_ingredients: [],
            concentration: '',
            unit_count: 1,
            is_generic: false,
            bioequivalent_status: 'NO_BIOEQUIVALENTE' as const,
            condition: 'VD' as const,
        }];

        const { container } = render(
            <QueryClientProvider client={queryClient}>
                <StockEntryModal isOpen={true} onClose={vi.fn()} inventoryItems={inventoryItems as any} />
            </QueryClientProvider>
        );

        fireEvent.change(screen.getByPlaceholderText(/ean \/ sku/i), {
            target: { value: 'SKU-123' },
        });

        fireEvent.submit(container.querySelector('form')!);

        expect(await screen.findByText('Paracetamol')).not.toBeNull();
    });
});
