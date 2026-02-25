export interface LoginFailureLike {
    code?: string;
    retryable?: boolean;
}

// Debe cubrir el peor caso de conexión/reintentos en lib/db.ts
// (3 intentos con connectionTimeoutMillis=8000 + backoff incremental),
// para evitar falsos DB_TIMEOUT en el cliente.
const LOGIN_TIMEOUT_DEFAULT_MS = 30000;
const LOGIN_TIMEOUT_MIN_MS = 30000;
const LOGIN_TIMEOUT_MAX_MS = 60000;

export function resolveLoginTimeoutMs(rawValue?: string): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return LOGIN_TIMEOUT_DEFAULT_MS;
    return Math.min(LOGIN_TIMEOUT_MAX_MS, Math.max(LOGIN_TIMEOUT_MIN_MS, parsed));
}

export function isRetryableDbFailure(meta?: LoginFailureLike | null): boolean {
    if (!meta) return false;
    return Boolean(meta.retryable && meta.code && meta.code.startsWith('DB_'));
}

export function resolveLoginRetryCooldownMs(meta?: LoginFailureLike | null): number {
    if (!isRetryableDbFailure(meta)) return 0;

    switch (meta?.code) {
        case 'DB_DNS':
            return 12000;
        case 'DB_UNAVAILABLE':
            return 10000;
        case 'DB_TIMEOUT':
            return 8000;
        default:
            return 6000;
    }
}
