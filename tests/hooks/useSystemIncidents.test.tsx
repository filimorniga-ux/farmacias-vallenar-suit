/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getRecentSystemIncidentsSecureMock: vi.fn(),
}));

const INCIDENT_TIMESTAMP = '2026-04-01T15:01:21.468Z';

vi.mock('@/actions/maintenance-v2', () => ({
    getRecentSystemIncidentsSecure: mocks.getRecentSystemIncidentsSecureMock,
}));

import { useSystemIncidents } from '@/presentation/hooks/useSystemIncidents';

const sampleIncidents = [
    {
        id: 'incident-1',
        terminal_name: 'Caja 1',
        location_id: 'loc-1',
        cashier_name: 'Cajero Test',
        closed_at: INCIDENT_TIMESTAMP,
        end_time: INCIDENT_TIMESTAMP,
        notes: 'Auto cierre',
    },
];

function createWrapper(queryClient?: QueryClient) {
    const client = queryClient ?? new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

describe('useSystemIncidents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('no consulta mientras esté deshabilitado', async () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useSystemIncidents(false), { wrapper });

        await waitFor(() => {
            expect(result.current.fetchStatus).toBe('idle');
        });

        expect(mocks.getRecentSystemIncidentsSecureMock).not.toHaveBeenCalled();
    });

    it('consulta incidencias cuando se habilita', async () => {
        mocks.getRecentSystemIncidentsSecureMock.mockResolvedValue({
            success: true,
            data: sampleIncidents.map(({ end_time, ...incident }) => incident),
        });

        const wrapper = createWrapper();
        const { result } = renderHook(() => useSystemIncidents(true), { wrapper });

        await waitFor(() => {
            expect(result.current.data).toEqual(sampleIncidents);
        });

        expect(mocks.getRecentSystemIncidentsSecureMock).toHaveBeenCalledTimes(1);
    });

    it('reutiliza cache en remount con el mismo QueryClient', async () => {
        mocks.getRecentSystemIncidentsSecureMock.mockResolvedValue({
            success: true,
            data: sampleIncidents.map(({ end_time, ...incident }) => incident),
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        const wrapper = createWrapper(queryClient);
        const first = renderHook(() => useSystemIncidents(true), { wrapper });

        await waitFor(() => {
            expect(first.result.current.data).toEqual(sampleIncidents);
        });

        first.unmount();
        renderHook(() => useSystemIncidents(true), { wrapper });

        await waitFor(() => {
            expect(mocks.getRecentSystemIncidentsSecureMock).toHaveBeenCalledTimes(1);
        });
    });
});
