import { StateStorage } from 'zustand/middleware';
import { buildScopedStorageKey } from './persistenceScope';

/**
 * Evita acceso a Web Storage durante SSR/SSG.
 * Node.js 22+ expone `localStorage` global y puede emitir warnings
 * si se usa fuera de un contexto de navegador real.
 */
export const safeBrowserStateStorage: StateStorage = {
    getItem: (name: string): string | null => {
        if (typeof window === 'undefined') return null;
        try {
            return window.localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string): void => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(name, value);
        } catch {
            // ignore quota/write errors
        }
    },
    removeItem: (name: string): void => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.removeItem(name);
        } catch {
            // ignore remove errors
        }
    },
};

export function createScopedBrowserStateStorage(
    baseName: string,
    options?: { includeDeviceId?: boolean },
): StateStorage {
    return {
        getItem: (name: string): string | Promise<string | null> | null => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            return safeBrowserStateStorage.getItem(scopedName);
        },
        setItem: (name: string, value: string): void => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            safeBrowserStateStorage.setItem(scopedName, value);
        },
        removeItem: (name: string): void => {
            const scopedName = buildScopedStorageKey(baseName || name, options);
            safeBrowserStateStorage.removeItem(scopedName);
        },
    };
}
