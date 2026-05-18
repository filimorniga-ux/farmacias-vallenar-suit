export type AppEnvironment = 'staging' | 'production' | 'unknown';

export type EnvironmentPolicyInput = {
    appEnv?: string;
    vercelEnv?: string;
    appUrl?: string;
    publicAppUrl?: string;
    databaseUrl?: string;
    ci?: boolean;
};

export type EnvironmentPolicyResult = {
    appEnvironment: AppEnvironment;
    normalizedVercelEnv: string;
    isRealProductionTarget: boolean;
    isSyntheticProductionTarget: boolean;
    errors: string[];
    warnings: string[];
    infos: string[];
};

const STAGING_HOST_MARKERS = ['staging', 'preview', 'dev', 'localhost', '127.0.0.1', '.invalid'];
const SYNTHETIC_PRODUCTION_HOST_MARKERS = ['localhost', '127.0.0.1', '.invalid'];
const NON_PRODUCTION_DB_MARKERS = ['localhost', '127.0.0.1', 'staging', 'preview', 'sandbox', 'ci', 'test'];
const KNOWN_VERCEL_ENVS = new Set(['production', 'preview', 'development', '']);

function normalize(value?: string) {
    return String(value || '').trim().toLowerCase();
}

export function normalizeAppEnvironment(value?: string): AppEnvironment {
    const normalized = normalize(value);
    if (normalized === 'staging' || normalized === 'production') {
        return normalized;
    }

    return 'unknown';
}

function normalizeVercelEnvironment(value?: string) {
    return normalize(value);
}

function safeUrlHost(value?: string) {
    if (!value) return '';

    try {
        return new URL(value).host.toLowerCase();
    } catch {
        return '';
    }
}

function normalizedOrigin(value?: string) {
    if (!value) return '';

    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return '';
    }
}

function hostLooksLikeStaging(host: string) {
    return STAGING_HOST_MARKERS.some((marker) => host.includes(marker));
}

function hostLooksLikeSyntheticProduction(host: string) {
    return SYNTHETIC_PRODUCTION_HOST_MARKERS.some((marker) => host.includes(marker));
}

function databaseLooksNonProduction(url: string) {
    const normalized = normalize(url);
    return NON_PRODUCTION_DB_MARKERS.some((marker) => normalized.includes(marker));
}

export function evaluateEnvironmentPolicy(input: EnvironmentPolicyInput): EnvironmentPolicyResult {
    const appEnvironment = normalizeAppEnvironment(input.appEnv);
    const normalizedVercelEnv = normalizeVercelEnvironment(input.vercelEnv);
    const appOrigin = normalizedOrigin(input.appUrl);
    const publicOrigin = normalizedOrigin(input.publicAppUrl);
    const appHost = safeUrlHost(input.appUrl);
    const publicHost = safeUrlHost(input.publicAppUrl);
    const ci = Boolean(input.ci);

    const errors: string[] = [];
    const warnings: string[] = [];
    const infos: string[] = [];

    if (appEnvironment === 'unknown') {
        errors.push('APP_ENV debe declararse explícitamente como staging o production.');
    }

    if (!KNOWN_VERCEL_ENVS.has(normalizedVercelEnv)) {
        warnings.push(`VERCEL_ENV tiene un valor no estándar: "${input.vercelEnv}".`);
    }

    if (normalizedVercelEnv === 'production' && appEnvironment !== 'production') {
        errors.push('VERCEL_ENV=production exige APP_ENV=production.');
    }

    if ((normalizedVercelEnv === 'preview' || normalizedVercelEnv === 'development') && appEnvironment === 'production') {
        errors.push(`APP_ENV=production no puede convivir con VERCEL_ENV=${normalizedVercelEnv}.`);
    }

    if (appOrigin && publicOrigin && appOrigin !== publicOrigin) {
        errors.push('APP_URL y NEXT_PUBLIC_APP_URL deben apuntar al mismo origen.');
    }

    const isRealProductionTarget = appEnvironment === 'production' || normalizedVercelEnv === 'production';
    const isSyntheticProductionTarget = isRealProductionTarget && (
        ci ||
        hostLooksLikeSyntheticProduction(appHost) ||
        hostLooksLikeSyntheticProduction(publicHost)
    );

    if (appEnvironment === 'staging') {
        infos.push('APP_ENV=staging permite cuenta DEV controlada y recursos de prueba.');
        if (!appHost && !publicHost) {
            warnings.push('Staging sin APP_URL/NEXT_PUBLIC_APP_URL explícitas dificulta detectar mezcla de entornos.');
        }
    }

    if (isRealProductionTarget) {
        if (isSyntheticProductionTarget) {
            infos.push('Contexto de producción sintético detectado; se permiten host/DB de CI o rehearsal local.');
        } else {
            if (hostLooksLikeStaging(appHost) || hostLooksLikeStaging(publicHost)) {
                errors.push('Producción real no debe usar hosts de staging/preview/local.');
            }

            if (databaseLooksNonProduction(input.databaseUrl || '')) {
                errors.push('Producción real no debe apuntar a DATABASE_URL local, de staging o de pruebas.');
            }
        }
    }

    return {
        appEnvironment,
        normalizedVercelEnv,
        isRealProductionTarget,
        isSyntheticProductionTarget,
        errors,
        warnings,
        infos,
    };
}
