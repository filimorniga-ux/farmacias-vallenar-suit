'use client';
/**
 * useOfflineDB — React hook para operaciones SQLite offline en Electron.
 *
 * Detecta automáticamente si estamos en Electron y provee acceso
 * a la base de datos SQLite local, sincronización y backups.
 * En el navegador web, retorna stubs seguros (no-ops).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────
interface SyncStatus {
    isOnline: boolean;
    isSyncing: boolean;
    pendingItems: number;
    failedItems: number;
    status: 'online' | 'offline' | 'syncing' | 'error' | 'idle';
}

interface BackupInfo {
    filename: string;
    path: string;
    size: number;
    sizeMB: string;
    createdAt: string;
    compressed: boolean;
}

interface ElectronAPI {
    isElectron: boolean;
    offlineDB: {
        getAll: (table: string, where?: Record<string, unknown>, orderBy?: string) => Promise<unknown[]>;
        getById: (table: string, id: string) => Promise<unknown | null>;
        upsert: (table: string, data: Record<string, unknown>) => Promise<unknown>;
        upsertMany: (table: string, rows: Record<string, unknown>[]) => Promise<{ success: boolean; count: number }>;
        delete: (table: string, id: string) => Promise<unknown>;
        count: (table: string, where?: Record<string, unknown>) => Promise<number>;
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    };
    sync: {
        getStatus: () => Promise<SyncStatus>;
        forceSync: () => Promise<SyncStatus>;
        enqueue: (table: string, operation: string, recordId: string, payload: unknown) => Promise<{ success: boolean }>;
        onStatusUpdate: (callback: (data: { type: string; isOnline?: boolean; status?: string; pending?: number }) => void) => void;
        onPushRequest: (callback: (data: unknown) => void) => void;
        onPullRequest: (callback: (data: { tables: string[] }) => void) => void;
        sendPullResponse: (table: string, rows: unknown[]) => void;
    };
    backup: {
        create: () => Promise<{ filename: string; size: number; path: string } | null>;
        list: () => Promise<BackupInfo[]>;
        restore: (filename: string) => Promise<{ success: boolean }>;
        getDir: () => Promise<string>;
    };
}

// ─────────────────────────────────────────────────
// ELECTRON DETECTION
// ─────────────────────────────────────────────────
function getElectronAPI(): ElectronAPI | null {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
        const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
        if (api?.isElectron) return api;
    }
    return null;
}

export function isElectronEnv(): boolean {
    return getElectronAPI() !== null;
}

// ─────────────────────────────────────────────────
// HOOK: useOfflineDB
// ─────────────────────────────────────────────────
export function useOfflineDB() {
    const api = getElectronAPI();
    const isElectron = api !== null;

    // Generic CRUD that works in Electron (SQLite) or returns empty in web
    const getAll = useCallback(async <T = unknown>(table: string, where?: Record<string, unknown>, orderBy?: string): Promise<T[]> => {
        if (!api) return [];
        return api.offlineDB.getAll(table, where, orderBy) as Promise<T[]>;
    }, [api]);

    const getById = useCallback(async <T = unknown>(table: string, id: string): Promise<T | null> => {
        if (!api) return null;
        return api.offlineDB.getById(table, id) as Promise<T | null>;
    }, [api]);

    const upsert = useCallback(async (table: string, data: Record<string, unknown>) => {
        if (!api) return null;
        return api.offlineDB.upsert(table, data);
    }, [api]);

    const upsertMany = useCallback(async (table: string, rows: Record<string, unknown>[]) => {
        if (!api) return { success: false, count: 0 };
        return api.offlineDB.upsertMany(table, rows);
    }, [api]);

    const deleteById = useCallback(async (table: string, id: string) => {
        if (!api) return null;
        return api.offlineDB.delete(table, id);
    }, [api]);

    const count = useCallback(async (table: string, where?: Record<string, unknown>) => {
        if (!api) return 0;
        return api.offlineDB.count(table, where);
    }, [api]);

    const query = useCallback(async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
        if (!api) return [];
        return api.offlineDB.query(sql, params) as Promise<T[]>;
    }, [api]);

    // Enqueue a mutation for later sync
    const enqueueSync = useCallback(async (table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', recordId: string, payload: unknown) => {
        if (!api) return;
        return api.sync.enqueue(table, operation, recordId, payload);
    }, [api]);

    return {
        isElectron,
        getAll,
        getById,
        upsert,
        upsertMany,
        deleteById,
        count,
        query,
        enqueueSync,
    };
}

// ─────────────────────────────────────────────────
// HOOK: useSyncStatus (for Electron sync indicator)
// ─────────────────────────────────────────────────
export function useSyncStatus(): SyncStatus {
    const [status, setStatus] = useState<SyncStatus>({
        isOnline: true,
        isSyncing: false,
        pendingItems: 0,
        failedItems: 0,
        status: 'idle',
    });

    const apiRef = useRef(getElectronAPI());

    useEffect(() => {
        const api = apiRef.current;
        if (!api) return;

        // Get initial status
        api.sync.getStatus().then((s) => {
            setStatus({
                isOnline: s.isOnline,
                isSyncing: s.isSyncing,
                pendingItems: s.pendingItems,
                failedItems: s.failedItems,
                status: !s.isOnline ? 'offline' :
                    s.failedItems > 0 ? 'error' :
                        s.isSyncing ? 'syncing' :
                            s.pendingItems > 0 ? 'syncing' : 'idle',
            });
        });

        // Listen for updates from main process
        api.sync.onStatusUpdate((data) => {
            if (data.type === 'connectivity-change') {
                setStatus(prev => ({
                    ...prev,
                    isOnline: data.isOnline ?? prev.isOnline,
                    status: data.isOnline ? 'idle' : 'offline',
                }));
            } else if (data.type === 'sync-status') {
                setStatus(prev => ({
                    ...prev,
                    isSyncing: data.status === 'syncing' || data.status === 'pulling',
                    pendingItems: data.pending ?? prev.pendingItems,
                    status: data.status === 'error' ? 'error' :
                        data.status === 'syncing' || data.status === 'pulling' ? 'syncing' :
                            prev.isOnline ? 'idle' : 'offline',
                }));
            }
        });
    }, []);

    return status;
}

// ─────────────────────────────────────────────────
// HOOK: useBackups (for backup management UI)
// ─────────────────────────────────────────────────
export function useBackups() {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const api = getElectronAPI();

    const refresh = useCallback(async () => {
        if (!api) return;
        setIsLoading(true);
        try {
            const list = await api.backup.list();
            setBackups(list);
        } finally {
            setIsLoading(false);
        }
    }, [api]);

    const createBackup = useCallback(async () => {
        if (!api) return null;
        const result = await api.backup.create();
        await refresh();
        return result;
    }, [api, refresh]);

    const restoreBackup = useCallback(async (filename: string) => {
        if (!api) return false;
        const result = await api.backup.restore(filename);
        return result.success;
    }, [api]);

    const getBackupDir = useCallback(async () => {
        if (!api) return '';
        return api.backup.getDir();
    }, [api]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        backups,
        isLoading,
        isElectron: api !== null,
        refresh,
        createBackup,
        restoreBackup,
        getBackupDir,
    };
}
