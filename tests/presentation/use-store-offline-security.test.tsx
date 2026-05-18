/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useOfflineSales } from '@/lib/store/offlineSales';
import { useOutboxStore } from '@/lib/store/outboxStore';
import {
    clearActivePersistenceScope,
    getOrCreatePersistenceDeviceId,
    setActivePersistenceScope,
} from '@/lib/store/persistenceScope';

const mocks = vi.hoisted(() => ({
    authenticateUserSecure: vi.fn(),
}));

vi.mock('@/actions/auth-v2', () => ({
    authenticateUserSecure: mocks.authenticateUserSecure,
}));

vi.mock('@/presentation/store/indexedDBStorage', () => ({
    createScopedIndexedDBWithLocalStorageFallback: () => ({
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
    }),
    indexedDBWithLocalStorageFallback: {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
    },
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        warning: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
    },
}));

describe('useStore offline scope hardening', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const storage = new Map<string, string>();
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
                removeItem: (key: string) => {
                    storage.delete(key);
                },
                clear: () => {
                    storage.clear();
                },
            },
        });

        for (const key of [
            'farmacias-vallenar-active-scope',
            'farmacias-vallenar-device-id',
            'farmacias-vallenar-outbox',
            'farmacias-vallenar-offline-sales',
            'pharma-storage',
        ]) {
            window.localStorage.removeItem(key);
        }
        clearActivePersistenceScope();
        usePharmaStore.setState({
            user: null,
            employees: [],
            inventory: [],
            customers: [],
            suppliers: [],
            salesHistory: [],
            cashMovements: [],
            expenses: [],
            currentLocationId: '',
            currentWarehouseId: '',
            currentTerminalId: '',
            currentShift: null,
            dailyShifts: [],
            cart: [],
            currentCustomer: null,
            terminals: [],
        });
        useOfflineSales.setState({ pendingSales: [] });
        useOutboxStore.setState({ queue: [], isSyncing: false });
        await Promise.allSettled([
            useOfflineSales.persist.clearStorage(),
            useOutboxStore.persist.clearStorage(),
            usePharmaStore.persist.clearStorage(),
        ]);
    });

    it('rejects offline login when the cached scope is expired', async () => {
        const pin = '1234';
        const hashedPin = window.btoa(pin).split('').reverse().join('');

        usePharmaStore.setState({
            employees: [
                {
                    id: 'user-1',
                    name: 'Caja 1',
                    rut: '12345678-9',
                    role: 'CASHIER',
                    status: 'ACTIVE',
                    job_title: 'CAJERO_VENDEDOR',
                    assigned_location_id: 'loc-1',
                    token_version: 7,
                    access_pin: hashedPin,
                },
            ],
        });

        setActivePersistenceScope({
            userId: 'user-1',
            locationId: 'loc-1',
            sessionVersion: 7,
            lastSyncAt: Date.now() - (1000 * 60 * 60 * 13),
        });

        mocks.authenticateUserSecure.mockRejectedValue(new Error('db offline'));

        const result = await usePharmaStore.getState().login('user-1', pin, 'loc-1');

        expect(result.success).toBe(false);
        expect(result.code).toBe('OFFLINE_SCOPE_INVALID');
    });

    it('rejects offline login when the cached token version no longer matches', async () => {
        const pin = '1234';
        const hashedPin = window.btoa(pin).split('').reverse().join('');

        usePharmaStore.setState({
            employees: [
                {
                    id: 'user-1',
                    name: 'Caja 1',
                    rut: '12345678-9',
                    role: 'CASHIER',
                    status: 'ACTIVE',
                    job_title: 'CAJERO_VENDEDOR',
                    assigned_location_id: 'loc-1',
                    token_version: 8,
                    access_pin: hashedPin,
                },
            ],
        });

        setActivePersistenceScope({
            userId: 'user-1',
            locationId: 'loc-1',
            sessionVersion: 7,
            lastSyncAt: Date.now(),
        });

        mocks.authenticateUserSecure.mockRejectedValue(new Error('db offline'));

        const result = await usePharmaStore.getState().login('user-1', pin, 'loc-1');

        expect(result.success).toBe(false);
        expect(result.code).toBe('OFFLINE_SCOPE_INVALID');
    });

    it('clears scoped queues and persistence on logout', async () => {
        setActivePersistenceScope({
            userId: 'user-1',
            locationId: 'loc-1',
            sessionVersion: 4,
            lastSyncAt: Date.now(),
        });

        usePharmaStore.setState({
            user: {
                id: 'user-1',
                name: 'Caja 1',
                rut: '12345678-9',
                role: 'CASHIER',
                status: 'ACTIVE',
                job_title: 'CAJERO_VENDEDOR',
                assigned_location_id: 'loc-1',
                token_version: 4,
            },
            employees: [
                {
                    id: 'user-1',
                    name: 'Caja 1',
                    rut: '12345678-9',
                    role: 'CASHIER',
                    status: 'ACTIVE',
                    job_title: 'CAJERO_VENDEDOR',
                    assigned_location_id: 'loc-1',
                    token_version: 4,
                },
            ],
            currentLocationId: 'loc-1',
        });

        const deviceId = getOrCreatePersistenceDeviceId();
        useOfflineSales.setState({
            pendingSales: [
                {
                    id: 'sale-1',
                    timestamp: new Date().toISOString(),
                    items: [],
                    total: 1000,
                    locationId: 'loc-1',
                    terminalId: 'term-1',
                    sessionId: 'session-1',
                    userId: 'user-1',
                    paymentMethod: 'CASH',
                    syncStatus: 'PENDING',
                    retryCount: 0,
                    originUserId: 'user-1',
                    originLocationId: 'loc-1',
                    originSessionVersion: 4,
                    originDeviceId: deviceId,
                },
            ],
        });
        useOutboxStore.setState({
            queue: [
                {
                    id: 'queue-1',
                    type: 'CLIENT_CREATE',
                    payload: { name: 'Cliente' },
                    createdAt: new Date().toISOString(),
                    status: 'PENDING',
                    retryCount: 0,
                    originUserId: 'user-1',
                    originLocationId: 'loc-1',
                    originSessionVersion: 4,
                    originDeviceId: deviceId,
                },
            ],
        });

        usePharmaStore.getState().logout();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(usePharmaStore.getState().user).toBeNull();
        expect(usePharmaStore.getState().employees).toHaveLength(0);
        expect(useOfflineSales.getState().pendingSales).toHaveLength(0);
        expect(useOutboxStore.getState().queue).toHaveLength(0);
        expect(window.localStorage.getItem('farmacias-vallenar-active-scope')).toBeNull();
    });
});
