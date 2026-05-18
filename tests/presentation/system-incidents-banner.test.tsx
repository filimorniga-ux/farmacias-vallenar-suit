/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getRecentSystemIncidentsSecureMock: vi.fn(),
    scheduleIdleTaskMock: vi.fn(),
    scheduledTask: null as null | (() => void),
}));

vi.mock('@/actions/maintenance-v2', () => ({
    getRecentSystemIncidentsSecure: mocks.getRecentSystemIncidentsSecureMock,
}));

vi.mock('@/presentation/lib/scheduleIdleTask', () => ({
    scheduleIdleTask: (callback: () => void, timeoutMs?: number) => {
        mocks.scheduleIdleTaskMock(timeoutMs);
        mocks.scheduledTask = callback;
        return () => {
            mocks.scheduledTask = null;
        };
    },
}));

const storeState = {
    user: { id: 'manager-1', role: 'MANAGER' },
};

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/presentation/components/dashboard/ReconciliationModal', () => ({
    ReconciliationModal: () => null,
}));

import SystemIncidentsBanner from '@/presentation/components/dashboard/SystemIncidentsBanner';

describe('SystemIncidentsBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeState.user = { id: 'manager-1', role: 'MANAGER' };
        mocks.scheduledTask = null;
    });

    afterEach(() => {
        mocks.scheduledTask = null;
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

    it('difiere la carga de incidencias fuera del mount inicial', async () => {
        mocks.getRecentSystemIncidentsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'incident-1',
                    terminal_name: 'Caja 1',
                    location_id: 'loc-1',
                    cashier_name: 'Cajero Test',
                    closed_at: new Date().toISOString(),
                    notes: 'Auto cierre',
                },
            ],
        });

        renderWithQueryClient(<SystemIncidentsBanner />);

        expect(mocks.scheduleIdleTaskMock).toHaveBeenCalledWith(4000);
        expect(mocks.getRecentSystemIncidentsSecureMock).not.toHaveBeenCalled();

        await act(async () => {
            mocks.scheduledTask?.();
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(mocks.getRecentSystemIncidentsSecureMock).toHaveBeenCalledTimes(1);
            expect(screen.getByText('1 Cierre Automático Detectado')).toBeTruthy();
        });
    });

    it('no consulta incidencias si el usuario no puede conciliarlas', async () => {
        storeState.user = { id: 'cashier-1', role: 'CASHIER' };

        renderWithQueryClient(<SystemIncidentsBanner />);

        expect(mocks.scheduleIdleTaskMock).not.toHaveBeenCalled();
        expect(mocks.getRecentSystemIncidentsSecureMock).not.toHaveBeenCalled();
        expect(screen.queryByText(/Cierre Automático Detectado/i)).toBeNull();
    });
});
