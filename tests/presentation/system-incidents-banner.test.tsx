/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getRecentSystemIncidentsSecureMock: vi.fn(),
}));

vi.mock('@/actions/maintenance-v2', () => ({
    getRecentSystemIncidentsSecure: mocks.getRecentSystemIncidentsSecureMock,
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        user: { id: 'manager-1' },
    }),
}));

vi.mock('@/presentation/components/dashboard/ReconciliationModal', () => ({
    ReconciliationModal: () => null,
}));

import SystemIncidentsBanner from '@/presentation/components/dashboard/SystemIncidentsBanner';

describe('SystemIncidentsBanner', () => {
    const originalRequestIdleCallback = globalThis.window?.requestIdleCallback;
    const originalCancelIdleCallback = globalThis.window?.cancelIdleCallback;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: undefined,
        });
        Object.defineProperty(window, 'cancelIdleCallback', {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        if (originalRequestIdleCallback) {
            window.requestIdleCallback = originalRequestIdleCallback;
        }
        if (originalCancelIdleCallback) {
            window.cancelIdleCallback = originalCancelIdleCallback;
        }
    });

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

        render(<SystemIncidentsBanner />);

        expect(mocks.getRecentSystemIncidentsSecureMock).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1199);
        });

        expect(mocks.getRecentSystemIncidentsSecureMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });

        expect(mocks.getRecentSystemIncidentsSecureMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText('1 Cierre Automático Detectado')).toBeTruthy();
    });
});
