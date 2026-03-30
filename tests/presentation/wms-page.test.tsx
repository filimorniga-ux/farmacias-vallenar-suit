/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WMSPage } from '@/presentation/pages/WMSPage';

const mocks = vi.hoisted(() => {
    const setInventoryMock = vi.fn();
    const bootstrapWmsMock = vi.fn();
    const locationState = {
        currentLocation: {
            id: 'loc-1',
            name: 'Sucursal Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        },
        locations: [{
            id: 'loc-1',
            name: 'Sucursal Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        }],
    };
    const pharmaState = {
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
        currentTerminalId: 'term-1',
        setCurrentLocation: vi.fn(),
        user: { id: 'user-1', assigned_location_id: 'loc-1' },
        receivePurchaseOrder: vi.fn(),
        finalizePurchaseOrderReview: vi.fn(),
        setInventory: setInventoryMock,
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
        bootstrapWmsMock,
        inventoryData: [
            { id: 'b1', sku: 'SKU-1', name: 'Producto 1', stock_actual: 10 },
            { id: 'b2', sku: 'SKU-2', name: 'Producto 2', stock_actual: 5 },
        ],
        locationState,
        pharmaState,
        setInventoryMock,
        usePharmaStoreMock,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector: (state: typeof mocks.locationState) => unknown) => selector(mocks.locationState),
}));

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isMobile: false,
        isDesktopLike: true,
        isLandscape: false,
    }),
}));

vi.mock('@/presentation/hooks/useBootstrapWms', () => ({
    useBootstrapWms: () => ({
        bootstrapWms: mocks.bootstrapWmsMock,
        isBootstrappingWms: false,
    }),
}));

vi.mock('@/presentation/hooks/useInventoryQuery', () => ({
    useInventoryQuery: () => ({
        data: mocks.inventoryData,
        isLoading: false,
    }),
}));

vi.mock('@/presentation/components/wms/tabs/WMSDespachoTab', () => ({
    WMSDespachoTab: ({ inventory }: { inventory: Array<{ id: string }> }) => (
        <div>Despacho inventory {inventory.length}</div>
    ),
}));

vi.mock('@/presentation/components/wms/tabs/WMSRecepcionTab', () => ({
    WMSRecepcionTab: ({ inventory }: { inventory: Array<{ id: string }> }) => (
        <div>Recepcion inventory {inventory.length}</div>
    ),
}));

vi.mock('@/presentation/components/wms/tabs/WMSTransferenciaTab', () => ({
    WMSTransferenciaTab: ({ inventory }: { inventory: Array<{ id: string }> }) => (
        <div>Transferencia inventory {inventory.length}</div>
    ),
}));

vi.mock('@/presentation/components/wms/tabs/WMSTransitoTab', () => ({
    WMSTransitoTab: () => <div>Transit stub</div>,
}));

vi.mock('@/presentation/components/wms/tabs/WMSPedidosTab', () => ({
    WMSPedidosTab: ({ inventory }: { inventory: Array<{ id: string }> }) => (
        <div>Pedidos inventory {inventory.length}</div>
    ),
}));

vi.mock('@/presentation/components/wms/tabs/WMSCrearPedidoTab', () => ({
    WMSCrearPedidoTab: ({ inventory }: { inventory: Array<{ id: string }> }) => (
        <div>Crear pedido inventory {inventory.length}</div>
    ),
}));

vi.mock('@/presentation/components/wms/WMSBottomTabBar', () => ({
    WMSBottomTabBar: () => null,
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

vi.mock('@/presentation/components/scm/SupplyChainHistoryTab', () => ({
    SupplyChainHistoryTab: () => null,
}));

vi.mock('@/presentation/components/scm/MovementDetailModal', () => ({
    MovementDetailModal: () => null,
}));

describe('WMSPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderPage = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <WMSPage />
            </QueryClientProvider>
        );
    };

    it('usa inventory desde React Query en las tabs WMS sin volver a copiarlo al store', () => {
        renderPage();

        expect(screen.getByText('Despacho inventory 2')).toBeTruthy();
        expect(mocks.setInventoryMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Recepción' }));
        expect(screen.getByText('Recepcion inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }));
        expect(screen.getByText('Transferencia inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Recep. Pedidos' }));
        expect(screen.getByText('Pedidos inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Crear Pedido' }));
        expect(screen.getByText('Crear pedido inventory 2')).toBeTruthy();
    });
});
