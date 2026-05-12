/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyChainPage from '@/presentation/pages/SupplyChainPage';
import { generateRestockSuggestionSecure } from '@/actions/procurement-v2';

const mocks = vi.hoisted(() => {
    const generateSuggestedPOsMock = vi.fn(() => []);
    const toastSuccessMock = vi.fn();
    const toastErrorMock = vi.fn();
    const toastInfoMock = vi.fn();
    const generateRestockSuggestionSecureMock = vi.fn();
    const platformState = {
        isMobile: false,
        isDesktopLike: true,
        isLandscape: false,
        viewportWidth: 1400,
    };
    const bootstrapSupplyProcurementMock = vi.fn();
    const manualOrderModalPropsMock = vi.fn();

    const pharmaState = {
        generateSuggestedPOs: generateSuggestedPOsMock,
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
        user: { id: '1719073d-9da1-40d7-9dce-28ac3a415a6b' },
    };

    const locationState = {
        currentLocation: { id: 'loc-1', name: 'Farmacia Test', default_warehouse_id: 'wh-1' },
        locations: [
            { id: 'loc-1', name: 'Farmacia Test', default_warehouse_id: 'wh-1' },
            { id: 'loc-2', name: 'Farmacia Norte', default_warehouse_id: 'wh-2' },
        ],
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    return {
        toastSuccessMock,
        toastErrorMock,
        toastInfoMock,
        generateRestockSuggestionSecureMock,
        usePharmaStoreMock,
        locationState,
        platformState,
        bootstrapSupplyProcurementMock,
        manualOrderModalPropsMock,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector: (state: typeof mocks.locationState) => unknown) => selector(mocks.locationState),
}));

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => mocks.platformState,
}));

vi.mock('@/presentation/hooks/useBootstrapSupplyProcurement', () => ({
    useBootstrapSupplyProcurement: () => ({
        suppliers: [{ id: 'SUP-1', name: 'Proveedor Test' }],
        isBootstrappingSupplyProcurement: false,
        error: null,
        bootstrapSupplyProcurement: mocks.bootstrapSupplyProcurementMock,
    }),
}));

vi.mock('@/presentation/store/useNotificationStore', () => ({
    useNotificationStore: () => ({}),
}));

vi.mock('@/presentation/hooks/useBarcodeScanner', () => ({
    useBarcodeScanner: () => undefined,
}));

vi.mock('@/presentation/components/scm/PurchaseOrderReceivingModal', () => ({
    PurchaseOrderReceivingModal: () => null,
}));

vi.mock('@/presentation/components/supply/ManualOrderModal', () => ({
    __esModule: true,
    default: (props: unknown) => {
        mocks.manualOrderModalPropsMock(props);
        return null;
    },
}));

vi.mock('@/presentation/components/supply/SupplyKanban', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/supply/TransferSuggestionsPanel', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/supply/SuggestionAnalysisHistoryPanel', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/ui/CameraScanner', () => ({
    __esModule: true,
    default: () => <div data-testid="camera-scanner">camera</div>,
}));

vi.mock('@/actions/procurement-v2', () => ({
    generateRestockSuggestionSecure: mocks.generateRestockSuggestionSecureMock,
}));

vi.mock('@/actions/procurement-export', () => ({
    exportSuggestedOrdersSecure: vi.fn(),
}));

vi.mock('@/actions/supply-v2', () => ({
    deletePurchaseOrderSecure: vi.fn(),
    receivePurchaseOrderSecure: vi.fn(),
    finalizePurchaseOrderReviewSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
        info: mocks.toastInfoMock,
    },
}));

const mockGenerateRestockSuggestionSecure = vi.mocked(generateRestockSuggestionSecure);

describe('SupplyChainPage - edición de sugerido', () => {
    const renderPage = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <SupplyChainPage />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.platformState.isMobile = false;
        mocks.platformState.isDesktopLike = true;
        mocks.platformState.isLandscape = false;
        mocks.platformState.viewportWidth = 1400;
        mockGenerateRestockSuggestionSecure.mockResolvedValue({
            success: true,
            data: [
                {
                    product_id: 'prod-1',
                    sku: 'SKU-001',
                    product_name: 'Producto Test',
                    supplier_name: 'Proveedor Test',
                    supplier_id: 'SUP-1',
                    supplier_sku: 'SUP-SKU-1',
                    unit_cost: 1000,
                    total_estimated: 0,
                    daily_velocity: 1,
                    current_stock: 100,
                    incoming_stock: 0,
                    safety_stock: 5,
                    max_stock: 20,
                    min_stock: 0,
                    suggested_order_qty: 0,
                    selected_analysis_window: 30,
                    selected_coverage_days: 15,
                    stock_level_percent: 0,
                    urgency: 'MEDIUM',
                    velocities: { 30: 1 },
                    sold_counts: { 30: 30 },
                    action_type: 'PURCHASE',
                    other_suppliers: [],
                    transfer_sources: [],
                },
            ],
        } as any);
    });

    it('permite borrar y reescribir el input de Sugerido sin que se pegue en 0', async () => {
        renderPage();

        fireEvent.click(screen.getByTestId('analyze-stock-btn'));

        await waitFor(() => {
            expect(mockGenerateRestockSuggestionSecure).toHaveBeenCalledTimes(1);
        });

        const qtyInput = await screen.findByTestId('suggested-qty-input-SKU-001');
        expect((qtyInput as HTMLInputElement).value).toBe('0');

        fireEvent.change(qtyInput, { target: { value: '' } });
        expect((qtyInput as HTMLInputElement).value).toBe('');

        fireEvent.change(qtyInput, { target: { value: '37' } });
        expect((qtyInput as HTMLInputElement).value).toBe('37');
    });

    it('muestra filtros colapsables y cards en móvil', async () => {
        mocks.platformState.isMobile = true;
        mocks.platformState.isDesktopLike = false;
        mocks.platformState.viewportWidth = 390;

        renderPage();

        expect(screen.getByTestId('mobile-filters-toggle')).toBeTruthy();
        expect(screen.getByLabelText('Cambiar vista de abastecimiento')).toBeTruthy();
        expect(screen.getByRole('button', { name: /abrir scanner de abastecimiento/i }).className).toContain('h-11');
        expect(screen.getByTestId('analyze-stock-btn').className).toContain('min-h-11');

        fireEvent.click(screen.getByTestId('analyze-stock-btn'));

        await waitFor(() => {
            expect(mockGenerateRestockSuggestionSecure).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByTestId('suggestion-card-SKU-001')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('carga el scanner solo cuando el usuario abre el flujo explícito', async () => {
        renderPage();

        expect(screen.queryByTestId('camera-scanner')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /abrir scanner de abastecimiento/i }));

        expect(await screen.findByTestId('camera-scanner')).not.toBeNull();
    });

    it('preload de orden respeta el contexto efectivo de ubicación y bodega', async () => {
        renderPage();

        fireEvent.click(screen.getByTestId('analyze-stock-btn'));

        await waitFor(() => {
            expect(mockGenerateRestockSuggestionSecure).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /Generar \(1\)/i }));

        await waitFor(() => {
            expect(mocks.manualOrderModalPropsMock).toHaveBeenCalled();
        });

        const lastCall = mocks.manualOrderModalPropsMock.mock.calls.at(-1)?.[0] as {
            initialOrder?: { destination_location_id?: string; target_warehouse_id?: string };
        };

        expect(lastCall.initialOrder?.destination_location_id).toBe('loc-1');
        expect(lastCall.initialOrder?.target_warehouse_id).toBe('wh-1');
    });
});
