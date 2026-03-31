/**
 * @vitest-environment jsdom
 */

import React from 'react';
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

    it('usa initialData sin hacer fetch inicial al montar', async () => {
        render(<ManagerDashboard initialData={sampleManagerData} />);

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

        render(<ManagerDashboard initialData={sampleManagerData} />);

        fireEvent.click(screen.getByRole('button', { name: 'Actualizar tablero gerencial' }));

        await waitFor(() => {
            expect(mocks.getManagerRealTimeDataSecureMock).toHaveBeenCalledTimes(1);
        });
    });
});
