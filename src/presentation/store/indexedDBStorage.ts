
import { StateStorage } from 'zustand/middleware';
import { buildScopedStorageKey } from '@/lib/store/persistenceScope';

const DB_NAME = 'farmacias-vallenar-store-db';
const STORE_NAME = 'zustand-store';

function getWindowLocalStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const storage = window.localStorage as Partial<Storage> | undefined;
    if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
        return null;
    }

    return storage as Storage;
}

export function isValidPersistedStateJSON(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;

    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            return reject(new Error('Server-side: IndexedDB not available'));
        }
        if (!window.indexedDB?.open) {
            return reject(new Error('IndexedDB not available'));
        }
        const request = window.indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const indexedDBStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(name);
                request.onsuccess = () => {
                    const rawValue = request.result || null;
                    if (typeof rawValue === 'string' && !isValidPersistedStateJSON(rawValue)) {
                        void indexedDBStorage.removeItem(name);
                        const storage = getWindowLocalStorage();
                        if (storage) {
                            storage.removeItem(name);
                        }
                        resolve(null);
                        return;
                    }
                    resolve(rawValue);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            // console.warn('Error reading from IndexedDB:', e);
            return null;
        }
    },
    setItem: async (name: string, value: string): Promise<void> => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(value, name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Error writing to IndexedDB:', e);
        }
    },
    removeItem: async (name: string): Promise<void> => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Error removing from IndexedDB:', e);
        }
    },
};

export const indexedDBWithLocalStorageFallback: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        const value = await indexedDBStorage.getItem(name);
        if (value !== null) {
            return value;
        }
        if (typeof window === 'undefined') {
            return null;
        }
        try {
            const storage = getWindowLocalStorage();
            const fallbackValue = storage?.getItem(name) ?? null;
            if (fallbackValue !== null) {
                if (!isValidPersistedStateJSON(fallbackValue)) {
                    storage?.removeItem(name);
                    await indexedDBStorage.removeItem(name);
                    return null;
                }
                await indexedDBStorage.setItem(name, fallbackValue);
                storage?.removeItem(name);
                return fallbackValue;
            }
        } catch (e) {
            console.warn('Error reading localStorage fallback:', e);
        }
        return null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await indexedDBStorage.setItem(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
        await indexedDBStorage.removeItem(name);
        const storage = getWindowLocalStorage();
        if (storage) {
            try {
                storage.removeItem(name);
            } catch (e) {
                console.warn('Error removing localStorage fallback:', e);
            }
        }
    },
};

export function createScopedIndexedDBWithLocalStorageFallback(
    baseName: string,
    options?: { includeDeviceId?: boolean },
): StateStorage {
    return {
        getItem: async (name: string): Promise<string | null> => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            return indexedDBWithLocalStorageFallback.getItem(scopedName);
        },
        setItem: async (name: string, value: string): Promise<void> => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            await indexedDBWithLocalStorageFallback.setItem(scopedName, value);
        },
        removeItem: async (name: string): Promise<void> => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            await indexedDBWithLocalStorageFallback.removeItem(scopedName);
        },
    };
}

export const safeLocalStorageStateStorage: StateStorage = {
    getItem: (name: string): string | null => {
        if (typeof window === 'undefined') {
            return null;
        }

        try {
            const storage = getWindowLocalStorage();
            const value = storage?.getItem(name) ?? null;
            if (value === null) {
                return null;
            }

            if (!isValidPersistedStateJSON(value)) {
                storage?.removeItem(name);
                return null;
            }

            return value;
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string): void => {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            getWindowLocalStorage()?.setItem(name, value);
        } catch {
            // ignore quota/write errors
        }
    },
    removeItem: (name: string): void => {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            getWindowLocalStorage()?.removeItem(name);
        } catch {
            // ignore remove errors
        }
    }
};
