/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PharmaState = {
    refreshShipments: (locationId?: string) => Promise<void>;
    refreshPurchaseOrders: (locationId?: string) => Promise<void>;
};

type LocationState = {
    locations: Array<{ id: string; name: string }>;
    fetchLocations: () => Promise<void>;
};

const mocks = vi.hoisted(() => {
    const pharmaState: PharmaState = {
        refreshShipments: vi.fn(async () => {}),
        refreshPurchaseOrders: vi.fn(async () => {}),
    };

    const locationState: LocationState = {
        locations: [],
        fetchLocations: vi.fn(async () => {}),
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: PharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    const useLocationStoreMock = function <T>(selector?: (state: LocationState) => T) {
        return selector ? selector(locationState) : (locationState as T);
    };

    return {
        pharmaState,
        locationState,
        usePharmaStoreMock,
        useLocationStoreMock,
        getSuppliersListSecureMock: vi.fn(),
        toastErrorMock: vi.fn(),
        sentryCaptureExceptionMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: mocks.useLocationStoreMock,
}));

vi.mock('@/actions/suppliers-v2', () => ({
    getSuppliersListSecure: mocks.getSuppliersListSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        error: mocks.toastErrorMock,
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: mocks.sentryCaptureExceptionMock,
}));

import { useBootstrapSupplyProcurement } from '@/presentation/hooks/useBootstrapSupplyProcurement';

describe('useBootstrapSupplyProcurement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.locationState.locations = [];
        mocks.locationState.fetchLocations = vi.fn(async () => {
            mocks.locationState.locations = [{ id: 'loc-1', name: 'Sucursal Centro' }];
        });
        mocks.pharmaState.refreshShipments = vi.fn(async () => {});
        mocks.pharmaState.refreshPurchaseOrders = vi.fn(async () => {});
        mocks.getSuppliersListSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'sup-1', name: 'Proveedor Uno' }],
        });
    });

    it('carga locations, suppliers y kanban del dominio cuando corresponde', async () => {
        const { result } = renderHook(() =>
            useBootstrapSupplyProcurement({
                activeLocationId: 'loc-1',
                enableKanbanBootstrap: true,
                loadSuppliers: true,
                loadLocations: true,
            })
        );

        await waitFor(() => {
            expect(mocks.locationState.fetchLocations).toHaveBeenCalledTimes(1);
            expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.pharmaState.refreshShipments).toHaveBeenCalledWith('loc-1');
            expect(mocks.pharmaState.refreshPurchaseOrders).toHaveBeenCalledWith('loc-1');
        });

        expect(result.current.suppliers).toEqual([{
            id: 'sup-1',
            name: 'Proveedor Uno',
            business_name: null,
            fantasy_name: null,
        }]);
    });

    it('omite el bootstrap del kanban cuando se desactiva, pero sigue cargando catálogo base', async () => {
        const { result } = renderHook(() =>
            useBootstrapSupplyProcurement({
                activeLocationId: 'loc-1',
                enableKanbanBootstrap: false,
                loadSuppliers: true,
                loadLocations: true,
            })
        );

        await waitFor(() => {
            expect(mocks.locationState.fetchLocations).toHaveBeenCalledTimes(1);
            expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.pharmaState.refreshShipments).not.toHaveBeenCalled();
        expect(mocks.pharmaState.refreshPurchaseOrders).not.toHaveBeenCalled();
        expect(result.current.suppliers).toEqual([{
            id: 'sup-1',
            name: 'Proveedor Uno',
            business_name: null,
            fantasy_name: null,
        }]);
    });

    it('permite forzar un nuevo bootstrap', async () => {
        const { result } = renderHook(() =>
            useBootstrapSupplyProcurement({
                activeLocationId: 'loc-1',
                enableKanbanBootstrap: true,
                loadSuppliers: true,
                loadLocations: true,
            })
        );

        await waitFor(() => {
            expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await result.current.bootstrapSupplyProcurement({ force: true });
        });

        expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(2);
        expect(mocks.pharmaState.refreshShipments).toHaveBeenCalledTimes(2);
        expect(mocks.pharmaState.refreshPurchaseOrders).toHaveBeenCalledTimes(2);
    });
});
