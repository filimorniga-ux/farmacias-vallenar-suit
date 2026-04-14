/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromSQLite } from '@/lib/offline/OfflineInterceptor';
import {
    clearActivePersistenceScope,
    setActivePersistenceScope,
} from '@/lib/store/persistenceScope';

describe('OfflineInterceptor.loadFromSQLite', () => {
    const getAll = vi.fn();

    beforeEach(() => {
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

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: {
                offlineDB: {
                    getAll,
                },
            },
        });

        clearActivePersistenceScope();
    });

    it('rejects loading offline data without an active scope', async () => {
        const result = await loadFromSQLite();

        expect(result).toBeNull();
        expect(getAll).not.toHaveBeenCalled();
    });

    it('scopes offline rehydration by active user and location', async () => {
        getAll
            .mockResolvedValueOnce([{ id: 'user-1' }])
            .mockResolvedValueOnce([{ id: 'loc-1' }])
            .mockResolvedValueOnce([{ id: 'prod-1' }])
            .mockResolvedValueOnce([{ id: 'batch-1', location_id: 'loc-1' }])
            .mockResolvedValueOnce([{ id: 'client-1' }]);

        setActivePersistenceScope({
            userId: 'user-1',
            locationId: 'loc-1',
            sessionVersion: 3,
            lastSyncAt: Date.now(),
        });

        const result = await loadFromSQLite();

        expect(result).not.toBeNull();
        expect(getAll).toHaveBeenCalledWith('users', { is_active: 1, id: 'user-1' });
        expect(getAll).toHaveBeenCalledWith('inventory_batches', { location_id: 'loc-1' });
    });
});
