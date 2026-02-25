/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyChainPage from '@/presentation/pages/SupplyChainPage';
import { generateRestockSuggestionSecure } from '@/actions/procurement-v2';

const mocks = vi.hoisted(() => {
    const syncDataMock = vi.fn();
    const fetchLocationsMock = vi.fn();
    const addPurchaseOrderMock = vi.fn();
    const receivePurchaseOrderMock = vi.fn();
    const generateSuggestedPOsMock = vi.fn(() => []);
    const toastSuccessMock = vi.fn();
    const toastErrorMock = vi.fn();
    const toastInfoMock = vi.fn();
    const generateRestockSuggestionSecureMock = vi.fn();

    const pharmaState = {
        inventory: [],
        suppliers: [],
        purchaseOrders: [],
        addPurchaseOrder: addPurchaseOrderMock,
        receivePurchaseOrder: receivePurchaseOrderMock,
        generateSuggestedPOs: generateSuggestedPOsMock,
        locations: [{ id: 'loc-1', name: 'Farmacia Test', default_warehouse_id: null }],
        fetchLocations: fetchLocationsMock,
        currentLocationId: 'loc-1',
        user: { id: '1719073d-9da1-40d7-9dce-28ac3a415a6b' },
    };

    const usePharmaStoreMock = Object.assign(
        () => pharmaState,
        {
            getState: () => ({ ...pharmaState, syncData: syncDataMock }),
        }
    );

    return {
        syncDataMock,
        fetchLocationsMock,
        toastSuccessMock,
        toastErrorMock,
        toastInfoMock,
        generateRestockSuggestionSecureMock,
        usePharmaStoreMock,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({ isDesktopLike: true, isLandscape: false, viewportWidth: 1400 }),
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
    default: () => null,
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
    CameraScanner: () => null,
}));

vi.mock('@/actions/procurement-v2', () => ({
    generateRestockSuggestionSecure: mocks.generateRestockSuggestionSecureMock,
}));

vi.mock('@/actions/procurement-export', () => ({
    exportSuggestedOrdersSecure: vi.fn(),
}));

vi.mock('@/actions/supply-v2', () => ({
    deletePurchaseOrderSecure: vi.fn(),
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
    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateRestockSuggestionSecure.mockResolvedValue({
            success: true,
            data: [
                {
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
                    urgency: 'LOW',
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
        render(<SupplyChainPage />);

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
});
