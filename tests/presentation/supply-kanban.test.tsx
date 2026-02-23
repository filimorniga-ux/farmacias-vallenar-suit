/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
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
    updatePurchaseOrderSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
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
});
