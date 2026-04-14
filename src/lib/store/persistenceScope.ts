type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PersistenceScope {
    userId: string;
    locationId: string;
    sessionVersion: number;
    lastSyncAt: number;
}

export interface QueueOwnershipMeta {
    originUserId: string;
    originLocationId: string;
    originSessionVersion: number;
    originDeviceId: string;
}

const ACTIVE_SCOPE_KEY = 'farmacias-vallenar-active-scope';
const DEVICE_ID_KEY = 'farmacias-vallenar-device-id';
const LEGACY_STORAGE_KEYS = [
    'pharma-storage',
    'farmacias-vallenar-offline-sales',
    'farmacias-vallenar-outbox',
] as const;

function getBrowserStorage(): StorageLike | null {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage as Partial<StorageLike> | undefined;
    if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
        return null;
    }
    return storage as StorageLike;
}

function safeParse<T>(rawValue: string | null): T | null {
    if (!rawValue) return null;
    try {
        return JSON.parse(rawValue) as T;
    } catch {
        return null;
    }
}

export function getOrCreatePersistenceDeviceId(): string {
    const storage = getBrowserStorage();
    if (!storage) return 'server-device';

    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const deviceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}`;

    storage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
}

export function getActivePersistenceScope(): PersistenceScope | null {
    const storage = getBrowserStorage();
    if (!storage) return null;

    return safeParse<PersistenceScope>(storage.getItem(ACTIVE_SCOPE_KEY));
}

export function setActivePersistenceScope(scope: PersistenceScope): void {
    const storage = getBrowserStorage();
    if (!storage) return;
    storage.setItem(ACTIVE_SCOPE_KEY, JSON.stringify(scope));
}

export function touchActivePersistenceScope(lastSyncAt: number = Date.now()): void {
    const current = getActivePersistenceScope();
    if (!current) return;

    setActivePersistenceScope({
        ...current,
        lastSyncAt,
    });
}

export function clearActivePersistenceScope(): void {
    const storage = getBrowserStorage();
    if (!storage) return;
    storage.removeItem(ACTIVE_SCOPE_KEY);
}

export function buildScopedStorageKey(
    baseName: string,
    options?: { includeDeviceId?: boolean; scope?: PersistenceScope | null },
): string {
    const scope = options?.scope ?? getActivePersistenceScope();
    const deviceId = getOrCreatePersistenceDeviceId();

    if (!scope) {
        return options?.includeDeviceId === false
            ? `${baseName}:anonymous:global`
            : `${baseName}:anonymous:global:${deviceId}`;
    }

    return options?.includeDeviceId === false
        ? `${baseName}:${scope.userId}:${scope.locationId || 'global'}`
        : `${baseName}:${scope.userId}:${scope.locationId || 'global'}:${deviceId}`;
}

export function buildOwnershipMeta(scope?: PersistenceScope | null): QueueOwnershipMeta | null {
    const effectiveScope = scope ?? getActivePersistenceScope();
    if (!effectiveScope) return null;

    return {
        originUserId: effectiveScope.userId,
        originLocationId: effectiveScope.locationId,
        originSessionVersion: effectiveScope.sessionVersion,
        originDeviceId: getOrCreatePersistenceDeviceId(),
    };
}

export function hasMatchingOwnership(
    item: Partial<QueueOwnershipMeta> | null | undefined,
    scope?: PersistenceScope | null,
): boolean {
    const effectiveScope = scope ?? getActivePersistenceScope();
    if (!effectiveScope || !item) return false;

    return item.originUserId === effectiveScope.userId
        && item.originLocationId === effectiveScope.locationId
        && Number(item.originSessionVersion) === Number(effectiveScope.sessionVersion)
        && item.originDeviceId === getOrCreatePersistenceDeviceId();
}

export function isOfflineScopeExpired(ttlMs: number, scope?: PersistenceScope | null): boolean {
    const effectiveScope = scope ?? getActivePersistenceScope();
    if (!effectiveScope?.lastSyncAt) return true;
    return Date.now() - effectiveScope.lastSyncAt > ttlMs;
}

export function clearLegacyPersistenceKeys(storage?: StorageLike | null): void {
    const effectiveStorage = storage ?? getBrowserStorage();
    if (!effectiveStorage) return;

    for (const key of LEGACY_STORAGE_KEYS) {
        effectiveStorage.removeItem(key);
    }
}

export function clearScopedPersistenceKeys(
    storage: StorageLike,
    keys: ReadonlyArray<{ baseName: string; includeDeviceId?: boolean }>,
    scope?: PersistenceScope | null,
): void {
    const effectiveScope = scope ?? getActivePersistenceScope();

    for (const key of keys) {
        storage.removeItem(buildScopedStorageKey(key.baseName, {
            includeDeviceId: key.includeDeviceId,
            scope: effectiveScope,
        }));
    }
}
