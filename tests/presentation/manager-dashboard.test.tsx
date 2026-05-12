/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getManagerRealTimeDataSecureMock: vi.fn(),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...props}>{children}</div>
        ),
    },
}));

vi.mock('@/actions/manager-dashboard-v2', () => ({
    getManagerRealTimeDataSecure: mocks.getManagerRealTimeDataSecureMock,
}));

import ManagerDashboard from '@/presentation/components/dashboard/ManagerDashboard';

const sampleManagerData = {
    branches: [
        {
            id: 'branch-1',
            name: 'Sucursal Centro',
            totalSales: 250000,
            transactionCount: 12,
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

describe('ManagerDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function renderWithQueryClient(ui: React.ReactElement) {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                {ui}
            </QueryClientProvider>
        );
    }

    it('usa initialData sin hacer fetch inicial al montar', async () => {
        renderWithQueryClient(<ManagerDashboard initialData={sampleManagerData} />);

        await waitFor(() => {
            expect(screen.getByText('Sucursal Centro')).toBeTruthy();
        });

        expect(mocks.getManagerRealTimeDataSecureMock).not.toHaveBeenCalled();
    });

    it('mantiene refresh manual cuando recibe initialData', async () => {
        mocks.getManagerRealTimeDataSecureMock.mockResolvedValue({
            success: true,
            data: sampleManagerData,
        });

        renderWithQueryClient(<ManagerDashboard initialData={sampleManagerData} />);

        fireEvent.click(screen.getByRole('button', { name: 'Actualizar tablero gerencial' }));

        await waitFor(() => {
            expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledTimes(1);
        });
    });

    it('mantiene target táctil mínimo en el refresh manual', () => {
        renderWithQueryClient(<ManagerDashboard initialData={sampleManagerData} />);

        const refreshButton = screen.getByRole('button', { name: 'Actualizar tablero gerencial' });
        expect(refreshButton.className).toContain('min-h-11');
        expect(refreshButton.className).toContain('min-w-11');
    });

    it('consulta la sucursal seleccionada cuando cambia el branch activo', async () => {
        mocks.getManagerRealTimeDataSecureMock.mockResolvedValue({
            success: true,
            data: {
                ...sampleManagerData,
                selectedBranch: {
                    ...sampleManagerData.selectedBranch,
                    locationId: 'branch-2',
                    locationName: 'Sucursal Norte',
                },
                branches: [
                    ...sampleManagerData.branches,
                    {
                        id: 'branch-2',
                        name: 'Sucursal Norte',
                        totalSales: 120000,
                        transactionCount: 5,
                    },
                ],
            },
        });

        renderWithQueryClient(<ManagerDashboard initialData={{
            ...sampleManagerData,
            branches: [
                ...sampleManagerData.branches,
                {
                    id: 'branch-2',
                    name: 'Sucursal Norte',
                    totalSales: 120000,
                    transactionCount: 5,
                },
            ],
        }} />);

        fireEvent.click(screen.getByRole('button', { name: /Sucursal Norte/i }));

        await waitFor(() => {
            expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledWith('branch-2');
        });
    });
});
