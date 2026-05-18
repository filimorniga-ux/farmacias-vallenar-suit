const DEFAULT_DB_POOL_MAX = 10;
const POOLED_DB_FALLBACK_MAX = 2;

function clampPoolMax(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_DB_POOL_MAX;
    }

    return Math.min(DEFAULT_DB_POOL_MAX, Math.max(1, Math.floor(value)));
}

export function resolveDbPoolMax(connectionString: string): number {
    if (!connectionString) {
        return DEFAULT_DB_POOL_MAX;
    }

    try {
        const parsed = new URL(connectionString);
        const pooled = parsed.searchParams.get('pgbouncer') === 'true';
        const rawConnectionLimit = parsed.searchParams.get('connection_limit');
        const connectionLimit = rawConnectionLimit ? Number(rawConnectionLimit) : null;

        if (pooled && connectionLimit) {
            return clampPoolMax(connectionLimit);
        }

        if (pooled) {
            return POOLED_DB_FALLBACK_MAX;
        }

        if (connectionLimit) {
            return clampPoolMax(connectionLimit);
        }
    } catch {
        if (connectionString.includes('pgbouncer=true')) {
            return POOLED_DB_FALLBACK_MAX;
        }
    }

    return DEFAULT_DB_POOL_MAX;
}

export const DB_POOL_DEFAULTS = {
    DEFAULT_DB_POOL_MAX,
    POOLED_DB_FALLBACK_MAX,
} as const;
