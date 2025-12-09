
import { StateStorage } from 'zustand/middleware';

const DB_NAME = 'farmacias-vallenar-store-db';
const STORE_NAME = 'zustand-store';

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
                request.onsuccess = () => resolve(request.result || null);
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
