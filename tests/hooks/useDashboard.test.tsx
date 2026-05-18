/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getDashboardStatsMock: vi.fn(),
}));

vi.mock('@/actions/analytics/dashboard-stats', () => ({
    getDashboardStats: mocks.getDashboardStatsMock,
}));

import { useDashboardMetrics } from '@/presentation/hooks/useDashboard';

const sampleStats = {
    todaySales: 125000,
    transactionCount: 42,
    lowStockCount: 3,
    pendingOrders: 7,
    totalInventoryValue: 980000,
    santiagoSales: 64000,
    colchaguaSales: 61000,
    lastSaleTime: '2026-03-31T14:00:00.000Z',
};

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useDashboardMetrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hidrata desde initialData sin hacer fetch inicial', async () => {
        const wrapper = createWrapper();

        const { result } = renderHook(
            () => useDashboardMetrics({ initialData: sampleStats }),
            { wrapper }
        );

        await waitFor(() => {
            expect(result.current.data).toEqual(sampleStats);
        });

        expect(mocks.getDashboardStatsMock).not.toHaveBeenCalled();
    });

    it('consulta métricas cuando no recibe initialData', async () => {
        mocks.getDashboardStatsMock.mockResolvedValue(sampleStats);
        const wrapper = createWrapper();

        const { result } = renderHook(() => useDashboardMetrics(), { wrapper });

        await waitFor(() => {
            expect(result.current.data).toEqual(sampleStats);
        });

        expect(mocks.getDashboardStatsMock).toHaveBeenCalledTimes(1);
    });
});
