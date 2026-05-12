/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WMSPedidosTab } from '@/presentation/components/wms/tabs/WMSPedidosTab';
import type { InventoryBatch } from '@/domain/types';

const batch: InventoryBatch = {
    id: 'batch-1',
    product_id: 'prod-1',
    sku: 'SKU-1',
    name: 'Producto Test',
    concentration: '500mg',
    unit_count: 1,
    is_generic: false,
    bioequivalent_status: 'NO_BIOEQUIVALENTE',
    condition: 'VD',
    location_id: 'loc-1',
    warehouse_id: 'wh-1',
    stock_actual: 10,
    stock_min: 0,
    stock_max: 100,
    expiry_date: Date.now(),
    cost_net: 100,
    tax_percent: 19,
    price_sell_box: 200,
    price_sell_unit: 200,
    price: 200,
    cost_price: 100,
    category: 'MEDICAMENTO',
    allows_commission: false,
    active_ingredients: [],
    laboratory: 'Lab Test',
    lot_number: 'LOT-1',
};

const mocks = vi.hoisted(() => {
    const pharmaState = {
        currentLocationId: '',
        currentWarehouseId: '',
        user: {
            id: 'user-1',
            assigned_location_id: 'loc-1',
        },
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        { getState: () => pharmaState },
    );

    const locationState = {
        currentLocation: null,
        locations: [{
            id: 'loc-1',
            name: 'Sucursal Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        }],
    };

    return {
        executeStockMovementSecureMock: vi.fn(),
        getSuppliersListSecureMock: vi.fn(),
        toastSuccessMock: vi.fn(),
        toastErrorMock: vi.fn(),
        pharmaState,
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

vi.mock('@/actions/suppliers-v2', () => ({
    getSuppliersListSecure: mocks.getSuppliersListSecureMock,
}));

vi.mock('@/actions/wms-v2', () => ({
    executeStockMovementSecure: mocks.executeStockMovementSecureMock,
}));

vi.mock('@/actions/inventory-export-v2', () => ({
    exportStockMovementsSecure: vi.fn(),
}));

vi.mock('@/presentation/components/wms/WMSProductScanner', () => ({
    WMSProductScanner: ({ onProductSelected }: { onProductSelected: (product: InventoryBatch) => void }) => (
        <button onClick={() => onProductSelected(batch)}>Agregar producto de prueba</button>
    ),
}));

vi.mock('@/presentation/components/wms/WMSReportPanel', () => ({
    WMSReportPanel: () => null,
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
    },
}));

describe('WMSPedidosTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getSuppliersListSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'sup-1', business_name: 'Proveedor Uno' }],
        });
        mocks.executeStockMovementSecureMock.mockResolvedValue({ success: true });
    });

    const renderTab = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <WMSPedidosTab inventory={[batch]} />
            </QueryClientProvider>,
        );
    };

    it('construye un payload canónico con producto, lote, bodega y actor correctos', async () => {
        renderTab();

        await waitFor(() => {
            expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Agregar producto de prueba' }));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sup-1' } });
        fireEvent.change(screen.getByPlaceholderText('Ej: F-001234'), { target: { value: 'F-123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Registrar Pedido' }));

        await waitFor(() => {
            expect(mocks.executeStockMovementSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.executeStockMovementSecureMock).toHaveBeenCalledWith(expect.objectContaining({
            productId: 'prod-1',
            batchId: 'batch-1',
            warehouseId: 'wh-1',
            userId: 'user-1',
            type: 'PURCHASE_ENTRY',
            quantity: 1,
        }));
    });
});
