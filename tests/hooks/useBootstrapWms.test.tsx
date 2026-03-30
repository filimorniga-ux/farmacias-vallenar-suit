/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PharmaState = {
    refreshPurchaseOrders: (locationId?: string) => Promise<void>;
};

const mocks = vi.hoisted(() => {
    const state: PharmaState = {
        refreshPurchaseOrders: vi.fn(async () => {}),
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: PharmaState) => T) {
            return selector ? selector(state) : (state as T);
        },
        {
            getState: () => state,
        }
    );

    return {
        state,
        usePharmaStoreMock,
        ensureQueryDataMock: vi.fn(async () => []),
        fetchQueryMock: vi.fn(async () => []),
        queryClientMock: {
            ensureQueryData: vi.fn(async () => []),
            fetchQuery: vi.fn(async () => []),
        },
        toastErrorMock: vi.fn(),
        sentryCaptureExceptionMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('sonner', () => ({
    toast: {
        error: mocks.toastErrorMock,
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: mocks.sentryCaptureExceptionMock,
}));

vi.mock('@tanstack/react-query', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => mocks.queryClientMock,
    };
});

import { useBootstrapWms } from '@/presentation/hooks/useBootstrapWms';

describe('useBootstrapWms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.state.refreshPurchaseOrders = vi.fn(async () => {});
        mocks.queryClientMock.ensureQueryData = mocks.ensureQueryDataMock.mockResolvedValue([]);
        mocks.queryClientMock.fetchQuery = mocks.fetchQueryMock.mockResolvedValue([]);
    });

    it('no bootstrapea si no hay ubicación activa', async () => {
        const { result } = renderHook(() => useBootstrapWms({ activeLocationId: undefined }));

        await waitFor(() => {
            expect(result.current.isBootstrappingWms).toBe(false);
        });

        expect(mocks.ensureQueryDataMock).not.toHaveBeenCalled();
        expect(mocks.fetchQueryMock).not.toHaveBeenCalled();
        expect(mocks.state.refreshPurchaseOrders).not.toHaveBeenCalled();
    });

    it('ejecuta bootstrap una sola vez por ubicación y permite forzar refresh', async () => {
        const { result, rerender } = renderHook(
            ({ activeLocationId }) => useBootstrapWms({ activeLocationId }),
            {
                initialProps: { activeLocationId: 'loc-1' },
            }
        );

        await waitFor(() => {
            expect(mocks.ensureQueryDataMock).toHaveBeenCalledTimes(1);
            expect(mocks.state.refreshPurchaseOrders).toHaveBeenCalledTimes(1);
        });

        rerender({ activeLocationId: 'loc-1' });

        expect(mocks.ensureQueryDataMock).toHaveBeenCalledTimes(1);
        expect(mocks.state.refreshPurchaseOrders).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.bootstrapWms({ force: true });
        });

        expect(mocks.fetchQueryMock).toHaveBeenCalledTimes(1);
        expect(mocks.state.refreshPurchaseOrders).toHaveBeenCalledTimes(2);
    });

    it('reporta error si falla el bootstrap', async () => {
        mocks.ensureQueryDataMock.mockImplementation(async () => {
            throw new Error('Fallo WMS');
        });

        const { result } = renderHook(() => useBootstrapWms({ activeLocationId: 'loc-2' }));

        await waitFor(() => {
            expect(mocks.toastErrorMock).toHaveBeenCalledWith('Fallo WMS');
        });

        expect(result.current.error).toBe('Fallo WMS');
        expect(mocks.sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
    });
});
