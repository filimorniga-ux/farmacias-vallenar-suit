/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        } as {
            id: string;
            name: string;
            type: 'STORE';
            default_warehouse_id: string;
        } | null,
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
    const platformState = {
        isMobile: false,
        isDesktopLike: true,
        isLandscape: false,
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
        shipmentsData: [
            {
                id: 'shp-1',
                type: 'INTER_BRANCH',
                status: 'IN_TRANSIT',
                origin_location_id: 'loc-2',
                origin_location_name: 'Bodega Norte',
                destination_location_id: 'loc-1',
                destination_location_name: 'Sucursal Centro',
                created_at: 1710000000000,
                items: [],
            },
        ],
        purchaseOrdersData: [
            {
                id: 'po-1',
                status: 'ORDERED',
                created_at: 1710000000000,
                target_warehouse_id: 'wh-1',
                destination_location_id: 'loc-1',
                items: [],
            },
        ],
        locationState,
        pharmaState,
        platformState,
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
    usePlatform: () => mocks.platformState,
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

vi.mock('@/presentation/hooks/useShipmentsQuery', () => ({
    useShipmentsQuery: () => ({
        data: mocks.shipmentsData,
        isLoading: false,
    }),
}));

vi.mock('@/presentation/hooks/usePurchaseOrdersQuery', () => ({
    usePurchaseOrdersQuery: () => ({
        data: mocks.purchaseOrdersData,
        isLoading: false,
    }),
}));

vi.mock('@/actions/supply-v2', () => ({
    receivePurchaseOrderSecure: vi.fn(),
    finalizePurchaseOrderReviewSecure: vi.fn(),
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
    WMSTransitoTab: ({ shipments, purchaseOrders }: { shipments: Array<{ id: string }>; purchaseOrders: Array<{ id: string }> }) => (
        <div>Transit shipments {shipments.length} purchase-orders {purchaseOrders.length}</div>
    ),
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
        vi.unstubAllGlobals();
        mocks.locationState.currentLocation = {
            id: 'loc-1',
            name: 'Sucursal Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        };
        mocks.locationState.locations = [{
            id: 'loc-1',
            name: 'Sucursal Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        }];
        mocks.pharmaState.currentLocationId = 'loc-1';
        mocks.pharmaState.currentWarehouseId = 'wh-1';
        mocks.pharmaState.currentTerminalId = 'term-1';
        mocks.pharmaState.user = { id: 'user-1', assigned_location_id: 'loc-1' };
        mocks.platformState.isMobile = false;
        mocks.platformState.isDesktopLike = true;
        mocks.platformState.isLandscape = false;
        localStorage.removeItem?.('context_location_id');
        localStorage.removeItem?.('preferred_location_id');
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

    it('usa inventory desde React Query en las tabs WMS sin volver a copiarlo al store', async () => {
        const findLoadedTabText = (text: string) => screen.findByText(text, {}, { timeout: 5000 });

        renderPage();

        expect(screen.getByText('Despacho inventory 2')).toBeTruthy();
        expect(mocks.setInventoryMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Recepción' }));
        expect(await findLoadedTabText('Recepcion inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }));
        expect(await findLoadedTabText('Transferencia inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Recep. Pedidos' }));
        expect(await findLoadedTabText('Pedidos inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Crear Pedido' }));
        expect(await findLoadedTabText('Crear pedido inventory 2')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'En Tránsito' }));
        expect(await findLoadedTabText('Transit shipments 1 purchase-orders 1')).toBeTruthy();
    });

    it('bootstrapea desde el contexto canónico y no desde localStorage legacy', async () => {
        mocks.pharmaState.currentLocationId = '';
        mocks.pharmaState.currentWarehouseId = '';
        mocks.locationState.currentLocation = null;
        mocks.pharmaState.user = { id: 'user-1', assigned_location_id: 'loc-1' };
        const getItemMock = vi.fn(() => 'loc-obsoleta');
        vi.stubGlobal('localStorage', {
            getItem: getItemMock,
            removeItem: vi.fn(),
        });

        renderPage();

        await waitFor(() => {
            expect(mocks.pharmaState.setCurrentLocation).toHaveBeenCalledWith('loc-1', 'wh-1', 'term-1');
        });
        expect(getItemMock).not.toHaveBeenCalled();
    });

    it('usa target táctil mínimo en el refresh móvil', () => {
        mocks.platformState.isMobile = true;
        mocks.platformState.isDesktopLike = false;

        renderPage();

        const refreshButton = screen.getByRole('button', { name: /Actualizar WMS/i });
        expect(refreshButton.className).toContain('h-11');
        expect(refreshButton.className).toContain('w-11');
    });
});
