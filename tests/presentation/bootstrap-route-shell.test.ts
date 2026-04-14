import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockEmployee = {
    id: string;
    name: string;
    role: string;
    assigned_location_id?: string;
};

type MockLocation = {
    id: string;
    name: string;
    default_warehouse_id?: string | null;
};

const mocks = vi.hoisted(() => {
    const pharmaState = {
        employees: [] as MockEmployee[],
        currentLocationId: 'loc-1',
        currentWarehouseId: '',
        currentTerminalId: '',
        user: { assigned_location_id: 'loc-1' },
        fetchTerminals: vi.fn(async () => {}),
    };

    const locationState = {
        locations: [] as MockLocation[],
        currentLocation: null as MockLocation | null,
        setLocations: vi.fn((locations: MockLocation[]) => {
            locationState.locations = locations;
        }),
        switchLocation: vi.fn((id: string) => {
            locationState.currentLocation = locationState.locations.find((location) => location.id === id) || null;
        }),
    };

    const pharmaSetState = vi.fn((partial: Record<string, unknown>) => {
        Object.assign(pharmaState, partial);
    });

    return {
        pharmaState,
        pharmaSetState,
        locationState,
        fetchEmployeesSecureMock: vi.fn(),
        fetchLocationsSecureMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: {
        getState: () => mocks.pharmaState,
        setState: mocks.pharmaSetState,
    },
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: {
        getState: () => mocks.locationState,
    },
}));

vi.mock('@/actions/sync-v2', () => ({
    fetchEmployeesSecure: mocks.fetchEmployeesSecureMock,
    fetchLocationsSecure: mocks.fetchLocationsSecureMock,
}));

import { bootstrapRouteShell } from '@/presentation/lib/bootstrapRouteShell';

describe('bootstrapRouteShell', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.pharmaState.employees = [];
        mocks.pharmaState.currentLocationId = 'loc-1';
        mocks.pharmaState.currentWarehouseId = '';
        mocks.pharmaState.currentTerminalId = '';
        mocks.pharmaState.user = { assigned_location_id: 'loc-1' };
        mocks.pharmaState.fetchTerminals = vi.fn(async () => {});

        mocks.locationState.locations = [];
        mocks.locationState.currentLocation = null;
        mocks.locationState.setLocations = vi.fn((locations: MockLocation[]) => {
            mocks.locationState.locations = locations;
        });
        mocks.locationState.switchLocation = vi.fn((id: string) => {
            mocks.locationState.currentLocation = mocks.locationState.locations.find((location) => location.id === id) || null;
        });

        mocks.fetchEmployeesSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'emp-1', name: 'Ana', role: 'MANAGER', assigned_location_id: 'loc-1' }],
        });
        mocks.fetchLocationsSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'loc-1', name: 'Sucursal Centro', default_warehouse_id: 'wh-1' }],
        });
    });

    it('bootstrapea dashboard con employees y locations sin disparar terminals', async () => {
        await bootstrapRouteShell('/dashboard');

        expect(mocks.pharmaState.employees).toEqual([
            { id: 'emp-1', name: 'Ana', role: 'MANAGER', assigned_location_id: 'loc-1' },
        ]);
        expect(mocks.locationState.setLocations).toHaveBeenCalledTimes(1);
        expect(mocks.locationState.switchLocation).toHaveBeenCalledWith('loc-1');
        expect(mocks.pharmaState.fetchTerminals).not.toHaveBeenCalled();
    });

    it('prefetch terminals solo en rutas operativas', async () => {
        await bootstrapRouteShell('/pos');

        expect(mocks.pharmaState.fetchTerminals).toHaveBeenCalledWith('loc-1');
    });

    it('no hace fallback público de usuarios cuando fetchEmployees falla', async () => {
        mocks.fetchEmployeesSecureMock.mockResolvedValue({
            success: false,
            error: 'No autenticado',
        });

        await bootstrapRouteShell('/dashboard');

        expect(mocks.pharmaState.employees).toEqual([]);
    });
});
