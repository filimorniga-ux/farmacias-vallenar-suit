/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processOutboxQueue } from '@/lib/sync-manager';
import { useOutboxStore } from '@/lib/store/outboxStore';
import {
    clearActivePersistenceScope,
    getOrCreatePersistenceDeviceId,
    setActivePersistenceScope,
} from '@/lib/store/persistenceScope';

const mocks = vi.hoisted(() => ({
    createCustomerSecure: vi.fn(),
    adjustCashSecure: vi.fn(),
    adjustStockSecure: vi.fn(),
    createProductSecure: vi.fn(),
}));

vi.mock('@/actions/customers-v2', () => ({
    createCustomerSecure: mocks.createCustomerSecure,
}));

vi.mock('@/actions/cash-management-v2', () => ({
    adjustCashSecure: mocks.adjustCashSecure,
}));

vi.mock('@/actions/inventory-v2', () => ({
    adjustStockSecure: mocks.adjustStockSecure,
}));

vi.mock('@/actions/products-v2', () => ({
    createProductSecure: mocks.createProductSecure,
}));

describe('sync-manager ownership enforcement', () => {
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
            },
        });
        clearActivePersistenceScope();
        useOutboxStore.setState({ queue: [], isSyncing: false });
        await useOutboxStore.persist.clearStorage();
    });

    it('marks foreign queue items as conflict and does not replay them', async () => {
        setActivePersistenceScope({
            userId: 'user-a',
            locationId: 'loc-a',
            sessionVersion: 3,
            lastSyncAt: Date.now(),
        });

        useOutboxStore.setState({
            queue: [
                {
                    id: 'item-1',
                    type: 'CLIENT_CREATE',
                    payload: { name: 'Cliente local' },
                    createdAt: new Date().toISOString(),
                    status: 'PENDING',
                    retryCount: 0,
                    originUserId: 'user-b',
                    originLocationId: 'loc-b',
                    originSessionVersion: 2,
                    originDeviceId: 'foreign-device',
                },
            ],
        });

        await processOutboxQueue();

        expect(mocks.createCustomerSecure).not.toHaveBeenCalled();
        expect(useOutboxStore.getState().queue[0]?.status).toBe('CONFLICT');
        expect(useOutboxStore.getState().queue[0]?.lastError).toContain('otra sesión');
    });

    it('quarantines pending items when there is no active scope', async () => {
        useOutboxStore.setState({
            queue: [
                {
                    id: 'item-1',
                    type: 'CLIENT_CREATE',
                    payload: { name: 'Cliente local' },
                    createdAt: new Date().toISOString(),
                    status: 'PENDING',
                    retryCount: 0,
                    originUserId: 'user-a',
                    originLocationId: 'loc-a',
                    originSessionVersion: 3,
                    originDeviceId: 'device-a',
                },
            ],
        });

        await processOutboxQueue();

        expect(mocks.createCustomerSecure).not.toHaveBeenCalled();
        expect(useOutboxStore.getState().queue[0]?.status).toBe('CONFLICT');
    });

    it('replays only items that match the active scope', async () => {
        setActivePersistenceScope({
            userId: 'user-a',
            locationId: 'loc-a',
            sessionVersion: 3,
            lastSyncAt: Date.now(),
        });

        const matchingItem = {
            id: 'item-1',
            type: 'CLIENT_CREATE' as const,
            payload: { name: 'Cliente local' },
            createdAt: new Date().toISOString(),
            status: 'PENDING' as const,
            retryCount: 0,
            originUserId: 'user-a',
            originLocationId: 'loc-a',
            originSessionVersion: 3,
            originDeviceId: getOrCreatePersistenceDeviceId(),
        };

        useOutboxStore.setState({
            queue: [matchingItem],
        });
        mocks.createCustomerSecure.mockResolvedValue({ success: true });

        await processOutboxQueue();

        expect(mocks.createCustomerSecure).toHaveBeenCalledWith({ name: 'Cliente local' });
        expect(useOutboxStore.getState().queue).toHaveLength(0);
    });
});
