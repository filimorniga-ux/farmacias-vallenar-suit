/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getManagerRealTimeDataSecureMock: vi.fn(),
}));

vi.mock('@/actions/manager-dashboard-v2', () => ({
    getManagerRealTimeDataSecure: mocks.getManagerRealTimeDataSecureMock,
}));

import { useManagerDashboard } from '@/presentation/hooks/useManagerDashboard';

const sampleManagerData = {
    branches: [
        {
            id: 'branch-1',
            name: 'Sucursal Centro',
            totalSales: 250000,
            transactionCount: 12,
        },
        {
            id: 'branch-2',
            name: 'Sucursal Norte',
            totalSales: 120000,
            transactionCount: 5,
        },
    ],
    selectedBranch: {
        locationId: 'branch-1',
        locationName: 'Sucursal Centro',
        financials: {
            cash: 100000,
            debit: 50000,
            credit: 30000,
            transfer: 20000,
            otherIncome: 5000,
            expenses: 4000,
            openingCash: 60000,
            totalCollected: 200000,
        },
        terminals: [],
        shifts: [],
        activeStaff: [],
    },
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

describe('useManagerDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hidrata desde initialData sin hacer fetch inicial', async () => {
        const wrapper = createWrapper();

        const { result } = renderHook(
            () => useManagerDashboard({ initialData: sampleManagerData }),
            { wrapper }
        );

        await waitFor(() => {
            expect(result.current.data).toEqual(sampleManagerData);
        });

        expect(mocks.getManagerRealTimeDataSecureMock).not.toHaveBeenCalled();
    });

    it('consulta datos cuando no recibe initialData', async () => {
        mocks.getManagerRealTimeDataSecureMock.mockResolvedValue({
            success: true,
            data: sampleManagerData,
        });

        const wrapper = createWrapper();
        const { result } = renderHook(() => useManagerDashboard(), { wrapper });

        await waitFor(() => {
            expect(result.current.data).toEqual(sampleManagerData);
        });

        expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledTimes(1);
        expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledWith(undefined);
    });

    it('usa una key distinta al cambiar la sucursal seleccionada', async () => {
        mocks.getManagerRealTimeDataSecureMock.mockResolvedValue({
            success: true,
            data: {
                ...sampleManagerData,
                selectedBranch: {
                    ...sampleManagerData.selectedBranch,
                    locationId: 'branch-2',
                    locationName: 'Sucursal Norte',
                },
            },
        });

        const wrapper = createWrapper();
        const { rerender } = renderHook(
            ({ selectedBranchId }) => useManagerDashboard({
                initialData: sampleManagerData,
                selectedBranchId,
            }),
            {
                wrapper,
                initialProps: { selectedBranchId: 'branch-1' as string | null },
            }
        );

        rerender({ selectedBranchId: 'branch-2' });

        await waitFor(() => {
            expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledWith('branch-2');
        });
    });
});
