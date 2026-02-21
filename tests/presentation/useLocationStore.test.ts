/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrganizationStructureSecure = vi.fn();
const getPublicLocationsSecure = vi.fn();

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: {
        getState: () => ({
            user: { id: 'user-1' }
        })
    }
}));

vi.mock('@/actions/network-v2', () => ({
    getOrganizationStructureSecure
}));

vi.mock('@/actions/public-network-v2', () => ({
    getPublicLocationsSecure
}));

vi.mock('@sentry/nextjs', () => ({
    captureMessage: vi.fn(),
    captureException: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
    }
}));

vi.mock('zustand/middleware', () => ({
    persist: (stateCreator: unknown) => stateCreator,
    createJSONStorage: () => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    }),
}));

import { useLocationStore } from '@/presentation/store/useLocationStore';

const locationFixture = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    type: 'STORE' as const,
    name: 'Sucursal Centro',
    address: 'Calle 1',
    associated_kiosks: [],
};

describe('useLocationStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        useLocationStore.setState({
            locations: [],
            currentLocation: null,
            kiosks: [],
            isLoading: false,
            lastFetch: 0,
            loadingSince: undefined,
        });
    });

    it('usa caché y evita refetch inmediato cuando no se fuerza', async () => {
        getOrganizationStructureSecure.mockResolvedValue({
            success: true,
            data: {
                locations: [locationFixture],
                terminals: [],
            },
        });

        await useLocationStore.getState().fetchLocations();
        expect(getOrganizationStructureSecure).toHaveBeenCalledTimes(1);

        await useLocationStore.getState().fetchLocations();
        expect(getOrganizationStructureSecure).toHaveBeenCalledTimes(1);

        await useLocationStore.getState().fetchLocations(true);
        expect(getOrganizationStructureSecure).toHaveBeenCalledTimes(2);
    });
});
