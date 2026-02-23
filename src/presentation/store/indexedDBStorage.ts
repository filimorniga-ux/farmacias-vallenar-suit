
import { StateStorage } from 'zustand/middleware';

const DB_NAME = 'farmacias-vallenar-store-db';
const STORE_NAME = 'zustand-store';

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
                        if (typeof window !== 'undefined') {
                            try {
                                window.localStorage.removeItem(name);
                            } catch {
                                // ignore cleanup failures
                            }
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
            const fallbackValue = window.localStorage.getItem(name);
            if (fallbackValue !== null) {
                if (!isValidPersistedStateJSON(fallbackValue)) {
                    window.localStorage.removeItem(name);
                    await indexedDBStorage.removeItem(name);
                    return null;
                }
                await indexedDBStorage.setItem(name, fallbackValue);
                window.localStorage.removeItem(name);
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
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.removeItem(name);
            } catch (e) {
                console.warn('Error removing localStorage fallback:', e);
            }
        }
    },
};

export const safeLocalStorageStateStorage: StateStorage = {
    getItem: (name: string): string | null => {
        if (typeof window === 'undefined') {
            return null;
        }

        try {
            const value = window.localStorage.getItem(name);
            if (value === null) {
                return null;
            }

            if (!isValidPersistedStateJSON(value)) {
                window.localStorage.removeItem(name);
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
            window.localStorage.setItem(name, value);
        } catch {
            // ignore quota/write errors
        }
    },
    removeItem: (name: string): void => {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            window.localStorage.removeItem(name);
        } catch {
            // ignore remove errors
        }
    }
};
