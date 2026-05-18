/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NetworkPage from '@/presentation/pages/NetworkPage';

const mocks = vi.hoisted(() => {
    const updateUserSecureMock = vi.fn();
    const syncDataMock = vi.fn();

    const pharmaState = {
        employees: [
            {
                id: 'emp-1',
                name: 'Ana Pérez',
                job_title: 'Cajera',
                assigned_location_id: null,
            },
            {
                id: 'emp-2',
                name: 'Luis Soto',
                job_title: 'Bodeguero',
                assigned_location_id: 'loc-1',
            },
        ],
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
        syncData: syncDataMock,
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
            setState: vi.fn((updater: Partial<typeof pharmaState> | ((state: typeof pharmaState) => Partial<typeof pharmaState>)) => {
                const partial = typeof updater === 'function' ? updater(pharmaState) : updater;
                Object.assign(pharmaState, partial);
            }),
        }
    );

    const locationState = {
        locations: [
            { id: 'loc-1', name: 'Sucursal Centro', type: 'STORE', is_active: true },
            { id: 'loc-2', name: 'Bodega Norte', type: 'WAREHOUSE', is_active: true },
        ],
        kiosks: [],
        currentLocation: { id: 'loc-1', name: 'Sucursal Centro', type: 'STORE', is_active: true },
        fetchLocations: vi.fn(),
        switchLocation: vi.fn(),
        registerKiosk: vi.fn(),
    };

    return {
        pharmaState,
        locationState,
        updateUserSecureMock,
        syncDataMock,
        usePharmaStoreMock,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector?: (state: typeof mocks.locationState) => unknown) =>
        selector ? selector(mocks.locationState) : mocks.locationState,
}));

vi.mock('@/actions/users-v2', () => ({
    updateUserSecure: mocks.updateUserSecureMock,
}));

vi.mock('@/actions/locations-v2', () => ({
    createLocationSecure: vi.fn(),
}));

vi.mock('@/presentation/components/settings/LocationEditModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('NetworkPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.pharmaState.employees = [
            {
                id: 'emp-1',
                name: 'Ana Pérez',
                job_title: 'Cajera',
                assigned_location_id: null,
            },
            {
                id: 'emp-2',
                name: 'Luis Soto',
                job_title: 'Bodeguero',
                assigned_location_id: 'loc-1',
            },
        ];
    });

    it('reasigna personal a la sucursal actual sin depender de syncData', async () => {
        mocks.updateUserSecureMock.mockResolvedValue({
            success: true,
            data: { id: 'emp-1', assigned_location_id: 'loc-1' },
        });

        render(<NetworkPage />);

        fireEvent.click(screen.getByRole('button', { name: /equipos/i }));
        fireEvent.click(screen.getAllByRole('button', { name: /mover a sucursal centro/i })[0]);

        await waitFor(() => {
            expect(mocks.updateUserSecureMock).toHaveBeenCalledWith({
                userId: 'emp-1',
                assigned_location_id: 'loc-1',
            });
        });

        expect(mocks.usePharmaStoreMock.setState).toHaveBeenCalledTimes(1);
        expect(mocks.pharmaState.employees.find((emp) => emp.id === 'emp-1')?.assigned_location_id).toBe('loc-1');
        expect(mocks.syncDataMock).not.toHaveBeenCalled();
    });

    it('desvincula personal enviando null y actualiza el store local', async () => {
        mocks.updateUserSecureMock.mockResolvedValue({
            success: true,
            data: { id: 'emp-2', assigned_location_id: null },
        });

        render(<NetworkPage />);

        fireEvent.click(screen.getByRole('button', { name: /equipos/i }));
        fireEvent.click(screen.getByTitle(/desvincular \(enviar a global\)/i));

        await waitFor(() => {
            expect(mocks.updateUserSecureMock).toHaveBeenCalledWith({
                userId: 'emp-2',
                assigned_location_id: null,
            });
        });

        expect(mocks.usePharmaStoreMock.setState).toHaveBeenCalledTimes(1);
        expect(mocks.pharmaState.employees.find((emp) => emp.id === 'emp-2')?.assigned_location_id).toBeUndefined();
        expect(mocks.syncDataMock).not.toHaveBeenCalled();
    });
});
