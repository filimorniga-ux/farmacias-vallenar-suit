/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LocationState = {
    locations: Array<{ id: string; name: string }>;
    fetchLocations: () => Promise<void>;
};

const mocks = vi.hoisted(() => {
    const locationState: LocationState = {
        locations: [],
        fetchLocations: vi.fn(async () => {}),
    };

    const useLocationStoreMock = function <T>(selector?: (state: LocationState) => T) {
        return selector ? selector(locationState) : (locationState as T);
    };

    return {
        locationState,
        useLocationStoreMock,
        queryClientMock: {
            ensureQueryData: vi.fn(async () => []),
            fetchQuery: vi.fn(async () => []),
        },
        getSuppliersListSecureMock: vi.fn(),
        toastErrorMock: vi.fn(),
        sentryCaptureExceptionMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: mocks.useLocationStoreMock,
}));

vi.mock('@tanstack/react-query', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => mocks.queryClientMock,
    };
});

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
        mocks.queryClientMock.ensureQueryData.mockResolvedValue([]);
        mocks.queryClientMock.fetchQuery.mockResolvedValue([]);
        mocks.getSuppliersListSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'sup-1', name: 'Proveedor Uno' }],
        });
    });

    it('carga locations, suppliers y precalienta el kanban del dominio cuando corresponde', async () => {
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
            expect(mocks.queryClientMock.ensureQueryData).toHaveBeenCalledTimes(2);
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

        expect(mocks.queryClientMock.ensureQueryData).not.toHaveBeenCalled();
        expect(mocks.queryClientMock.fetchQuery).not.toHaveBeenCalled();
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
            expect(mocks.queryClientMock.ensureQueryData).toHaveBeenCalledTimes(2);
        });

        await act(async () => {
            await result.current.bootstrapSupplyProcurement({ force: true });
        });

        expect(mocks.getSuppliersListSecureMock).toHaveBeenCalledTimes(2);
        expect(mocks.queryClientMock.fetchQuery).toHaveBeenCalledTimes(2);
    });
});
