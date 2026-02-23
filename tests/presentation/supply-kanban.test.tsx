/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyKanban from '@/presentation/components/supply/SupplyKanban';

type NullableLocation = { id: string } | null;
type PharmaState = {
    currentLocationId?: string;
    purchaseOrders: unknown[];
    shipments: unknown[];
    suppliers: unknown[];
    removePurchaseOrder: (id: string) => void;
    updatePurchaseOrder: (id: string, data: unknown) => void;
    refreshShipments: (locationId?: string) => Promise<void>;
    refreshPurchaseOrders: (locationId?: string) => Promise<void>;
    user: { id: string };
};

type LocationSelector = (state: { currentLocation: NullableLocation }) => unknown;

const mocks = vi.hoisted(() => {
    const refreshShipmentsMock = vi.fn<(locationId?: string) => Promise<void>>();
    const refreshPurchaseOrdersMock = vi.fn<(locationId?: string) => Promise<void>>();
    const removePurchaseOrderMock = vi.fn<(id: string) => void>();
    const updatePurchaseOrderMock = vi.fn<(id: string, data: unknown) => void>();
    const updatePurchaseOrderSecureMock = vi.fn();
    const getHistoryItemDetailsSecureMock = vi.fn();
    const toastErrorMock = vi.fn();
    const toastSuccessMock = vi.fn();

    const pharmaState: PharmaState = {
        currentLocationId: undefined,
        purchaseOrders: [],
        shipments: [],
        suppliers: [],
        removePurchaseOrder: removePurchaseOrderMock,
        updatePurchaseOrder: updatePurchaseOrderMock,
        refreshShipments: refreshShipmentsMock,
        refreshPurchaseOrders: refreshPurchaseOrdersMock,
        user: { id: '1719073d-9da1-40d7-9dce-28ac3a415a6b' },
    };

    let locationState: { currentLocation: NullableLocation } = { currentLocation: null };

    const usePharmaStoreMock = Object.assign(
        () => pharmaState,
        {
            getState: () => pharmaState,
        }
    );

    const useLocationStoreMock = (selector: LocationSelector) => selector(locationState);

    return {
        pharmaState,
        refreshShipmentsMock,
        refreshPurchaseOrdersMock,
        updatePurchaseOrderSecureMock,
        getHistoryItemDetailsSecureMock,
        toastErrorMock,
        toastSuccessMock,
        usePharmaStoreMock,
        useLocationStoreMock,
        setLocationState: (next: { currentLocation: NullableLocation }) => {
            locationState = next;
        },
    };
});

const {
    pharmaState,
    refreshShipmentsMock,
    refreshPurchaseOrdersMock,
    updatePurchaseOrderSecureMock,
    getHistoryItemDetailsSecureMock,
    toastErrorMock,
    toastSuccessMock,
    setLocationState,
} = mocks;

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: mocks.useLocationStoreMock,
}));

vi.mock('@/actions/supply-v2', () => ({
    deletePurchaseOrderSecure: vi.fn(),
    getHistoryItemDetailsSecure: mocks.getHistoryItemDetailsSecureMock,
    updatePurchaseOrderSecure: mocks.updatePurchaseOrderSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        error: mocks.toastErrorMock,
        success: mocks.toastSuccessMock,
    },
}));

describe('SupplyKanban fallback de ubicación', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (typeof localStorage?.removeItem === 'function') {
            localStorage.removeItem('context_location_id');
            localStorage.removeItem('preferred_location_id');
        }

        pharmaState.currentLocationId = undefined;
        pharmaState.purchaseOrders = [];
        pharmaState.shipments = [];
        setLocationState({ currentLocation: null });

        refreshShipmentsMock.mockResolvedValue(undefined);
        refreshPurchaseOrdersMock.mockResolvedValue(undefined);
        updatePurchaseOrderSecureMock.mockResolvedValue({ success: true });
        getHistoryItemDetailsSecureMock.mockResolvedValue({ success: true, data: [] });
    });

    it('usa scope corporativo cuando el locationId efectivo no es UUID válido', async () => {
        pharmaState.currentLocationId = 'farmacia-prat-legacy';

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(refreshShipmentsMock).toHaveBeenCalledTimes(1);
            expect(refreshPurchaseOrdersMock).toHaveBeenCalledTimes(1);
        });

        expect(refreshShipmentsMock).toHaveBeenCalledWith(undefined);
        expect(refreshPurchaseOrdersMock).toHaveBeenCalledWith(undefined);
    });

    it('aplica fallback corporativo cuando el scope por sucursal válida no tiene movimientos', async () => {
        pharmaState.currentLocationId = '550e8400-e29b-41d4-a716-446655440000';

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(refreshShipmentsMock).toHaveBeenCalledTimes(2);
            expect(refreshPurchaseOrdersMock).toHaveBeenCalledTimes(2);
        });

        expect(refreshShipmentsMock.mock.calls[0]?.[0]).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(refreshPurchaseOrdersMock.mock.calls[0]?.[0]).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(refreshShipmentsMock.mock.calls[1]?.[0]).toBeUndefined();
        expect(refreshPurchaseOrdersMock.mock.calls[1]?.[0]).toBeUndefined();
    });

    it('marca enviada usando warehouse_id legacy y line_items cuando falta target_warehouse_id/items', async () => {
        pharmaState.purchaseOrders = [
            {
                id: '550e8400-e29b-41d4-a716-446655440100',
                status: 'APPROVED',
                supplier_name: 'Proveedor Legacy',
                warehouse_id: '550e8400-e29b-41d4-a716-446655440200',
                items_count: 1,
                line_items: [
                    {
                        sku: 'SKU-001',
                        name: 'Producto Test',
                        quantity_ordered: 2,
                        cost_price: 1000,
                        product_id: '550e8400-e29b-41d4-a716-446655440300',
                    },
                ],
            },
        ];

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'MARCAR ENVIADA' }));
        expect(updatePurchaseOrderSecureMock).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar envío' }));

        await waitFor(() => {
            expect(updatePurchaseOrderSecureMock).toHaveBeenCalledTimes(1);
        });

        const payload = updatePurchaseOrderSecureMock.mock.calls[0]?.[1] as { targetWarehouseId?: string };
        expect(payload?.targetWarehouseId).toBe('550e8400-e29b-41d4-a716-446655440200');
        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene bodega de destino');
        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene items para enviar');
        expect(toastSuccessMock).toHaveBeenCalledWith('Orden marcada como enviada');
    });

    it('recupera items desde backend cuando la tarjeta no trae detalle', async () => {
        pharmaState.purchaseOrders = [
            {
                id: '550e8400-e29b-41d4-a716-446655440101',
                status: 'APPROVED',
                supplier_name: 'Proveedor Sin Detalle',
                target_warehouse_id: '550e8400-e29b-41d4-a716-446655440201',
                items_count: 2,
            },
        ];
        getHistoryItemDetailsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    sku: 'SKU-API-1',
                    name: 'Producto API',
                    quantity: 3,
                    cost: 1200,
                    product_id: '550e8400-e29b-41d4-a716-446655440301',
                },
            ],
        });

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'MARCAR ENVIADA' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar envío' }));

        await waitFor(() => {
            expect(getHistoryItemDetailsSecureMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440101', 'PO');
            expect(updatePurchaseOrderSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene items para enviar');
        expect(toastSuccessMock).toHaveBeenCalledWith('Orden marcada como enviada');
    });
});
