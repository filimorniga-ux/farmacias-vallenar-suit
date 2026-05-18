const DEFAULT_LOCAL_REHEARSAL_DB_URL = 'postgres://postgres@localhost:55433/farmacia_guardrails_ci';
const DEFAULT_GATE_BASE_URL = 'http://127.0.0.1:3100';
const DEFAULT_GATE_PORT = '3100';

type GateMode = 'ci' | 'local';
type DbSource = 'POSTGRES_URL_NON_POOLING' | 'LOCAL_REHEARSAL_FALLBACK';

export type ReleaseCriticalGateDbTarget = {
    mode: GateMode;
    source: DbSource;
    connectionString: string;
    baseUrl: string;
    port: string;
    host: string;
    portNumber: string;
    databaseName: string;
    reason: string;
    usesFallback: boolean;
};

export type ReleaseCriticalGateDbResolution =
    | { ok: true; target: ReleaseCriticalGateDbTarget }
    | {
        ok: false;
        mode: GateMode;
        baseUrl: string;
        port: string;
        fallbackUrl: string;
        errors: string[];
    };

function normalizeString(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function normalizeMode(ciValue?: string | null): GateMode {
    const normalized = String(ciValue || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' ? 'ci' : 'local';
}

function tryParseConnectionString(connectionString: string) {
    try {
        return new URL(connectionString);
    } catch {
        return null;
    }
}

function buildTarget(input: {
    mode: GateMode;
    source: DbSource;
    connectionString: string;
    baseUrl: string;
    port: string;
    reason: string;
    usesFallback: boolean;
}): ReleaseCriticalGateDbTarget {
    const parsed = tryParseConnectionString(input.connectionString);

    return {
        ...input,
        host: parsed?.hostname || 'unknown-host',
        portNumber: parsed?.port || '5432',
        databaseName: parsed?.pathname.replace(/^\//, '') || 'unknown-db',
    };
}

export function redactConnectionString(connectionString: string): string {
    const parsed = tryParseConnectionString(connectionString);
    if (!parsed) {
        return connectionString;
    }

    if (parsed.password) {
        parsed.password = '****';
    }

    return parsed.toString();
}

export type GateEnvInput = Record<string, string | undefined>;

function sanitizeReleaseGateEnv(env: GateEnvInput): GateEnvInput {
    const sanitized = { ...env };
    delete sanitized.NO_COLOR;
    delete sanitized.FORCE_COLOR;
    return sanitized;
}

export function resolveReleaseCriticalGateDbTarget(env: GateEnvInput): ReleaseCriticalGateDbResolution {
    const mode = normalizeMode(env.CI);
    const baseUrl = normalizeString(env.PLAYWRIGHT_BASE_URL) || DEFAULT_GATE_BASE_URL;
    const port = normalizeString(env.PORT) || DEFAULT_GATE_PORT;

    const nonPoolingUrl = normalizeString(env.POSTGRES_URL_NON_POOLING);
    if (nonPoolingUrl) {
        return {
            ok: true,
            target: buildTarget({
                mode,
                source: 'POSTGRES_URL_NON_POOLING',
                connectionString: nonPoolingUrl,
                baseUrl,
                port,
                reason: 'Usando POSTGRES_URL_NON_POOLING como única URL explícita válida para el gate crítico.',
                usesFallback: false,
            }),
        };
    }

    if (mode === 'local') {
        return {
            ok: true,
            target: buildTarget({
                mode,
                source: 'LOCAL_REHEARSAL_FALLBACK',
                connectionString: DEFAULT_LOCAL_REHEARSAL_DB_URL,
                baseUrl,
                port,
                reason: 'No hay POSTGRES_URL_NON_POOLING; se ignoran DATABASE_URL/POSTGRES_URL para evitar poolers y se usa fallback local de rehearsal en localhost:55433.',
                usesFallback: true,
            }),
        };
    }

    return {
        ok: false,
        mode,
        baseUrl,
        port,
        fallbackUrl: DEFAULT_LOCAL_REHEARSAL_DB_URL,
        errors: [
            'CI exige POSTGRES_URL_NON_POOLING configurada para el gate crítico.',
            'DATABASE_URL y POSTGRES_URL se ignoran en este runner para evitar poolers o targets saturables por accidente.',
            'El fallback localhost:55433 está deshabilitado en CI.',
        ],
    };
}

export function buildReleaseCriticalDbUnavailableMessage(
    target: ReleaseCriticalGateDbTarget,
    error: unknown,
): string {
    const rawError = error instanceof Error ? error.message : String(error || 'Unknown error');
    const targetLabel = `${target.host}:${target.portNumber}/${target.databaseName}`;

    if (target.usesFallback) {
        return [
            `Preflight DB falló para el fallback local ${targetLabel}.`,
            'El gate intentó usar localhost:55433 porque no encontró POSTGRES_URL_NON_POOLING.',
            'Levanta la DB local de rehearsal o exporta POSTGRES_URL_NON_POOLING reachable antes de correr el gate.',
            `Detalle técnico: ${rawError}`,
        ].join(' ');
    }

    return [
        `Preflight DB falló para ${target.source} -> ${targetLabel}.`,
        'La URL fue resuelta explícitamente desde el entorno, pero no respondió al check de conectividad.',
        'Corrige la variable de entorno o verifica conectividad/credenciales antes de correr el gate.',
        `Detalle técnico: ${rawError}`,
    ].join(' ');
}

export function getReleaseCriticalDbSuitabilityIssue(target: ReleaseCriticalGateDbTarget): string | null {
    const parsed = tryParseConnectionString(target.connectionString);
    if (!parsed) {
        return null;
    }

    const pooledHost = parsed.hostname.includes('pooler.supabase.com');
    const pooled = parsed.searchParams.get('pgbouncer') === 'true';
    const rawConnectionLimit = parsed.searchParams.get('connection_limit');
    const connectionLimit = rawConnectionLimit ? Number(rawConnectionLimit) : null;
    const connectionLimitOne = connectionLimit === 1;

    if (pooledHost || pooled || connectionLimitOne) {
        const signals = [
            pooledHost ? 'host pooler.supabase.com' : null,
            pooled ? 'pgbouncer=true' : null,
            connectionLimitOne ? 'connection_limit=1' : null,
        ].filter((signal): signal is string => Boolean(signal));

        return [
            `La URL ${target.source} no es apta para el gate crítico (${target.host}:${target.portNumber}/${target.databaseName}).`,
            `Señales detectadas: ${signals.join(', ')}.`,
            'Ese target sirve para checks livianos, pero no para el gate release critical con build + servidor + Playwright.',
            'Usa POSTGRES_URL_NON_POOLING o una DB local de rehearsal en localhost:55433 antes de correr este gate.',
        ].join(' ');
    }

    return null;
}

export function buildReleaseCriticalGateEnv(
    env: GateEnvInput,
    target: ReleaseCriticalGateDbTarget,
): GateEnvInput {
    return sanitizeReleaseGateEnv({
        ...env,
        DATABASE_URL: target.connectionString,
        POSTGRES_URL: target.connectionString,
        POSTGRES_URL_NON_POOLING: target.connectionString,
        APP_URL: env.APP_URL || target.baseUrl,
        NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL || target.baseUrl,
        PLAYWRIGHT_BASE_URL: target.baseUrl,
        PORT: target.port,
        NODE_OPTIONS: '',
        PLAYWRIGHT_USE_PROD_SERVER: '1',
        PLAYWRIGHT_WORKERS: '1',
    });
}

export const RELEASE_CRITICAL_GATE_DEFAULTS = {
    DEFAULT_LOCAL_REHEARSAL_DB_URL,
    DEFAULT_GATE_BASE_URL,
    DEFAULT_GATE_PORT,
} as const;
