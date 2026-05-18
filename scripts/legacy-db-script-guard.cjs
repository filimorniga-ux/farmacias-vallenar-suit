const SCRIPT_DB_NON_LOCAL_CONFIRMATION = 'APLICAR';

function redactConnectionString(connectionString) {
    try {
        const parsed = new URL(connectionString);
        if (parsed.password) parsed.password = '****';
        return parsed.toString();
    } catch {
        return connectionString;
    }
}

function isLocalDbTarget(connectionString) {
    try {
        const parsed = new URL(connectionString);
        return parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1' ||
            parsed.hostname === '::1';
    } catch {
        return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    }
}

function getPoolerSignals(connectionString) {
    try {
        const parsed = new URL(connectionString);
        return [
            parsed.hostname.includes('pooler.supabase.com') ? 'host pooler.supabase.com' : null,
            parsed.searchParams.get('pgbouncer') === 'true' ? 'pgbouncer=true' : null,
            parsed.searchParams.get('connection_limit') === '1' ? 'connection_limit=1' : null,
        ].filter(Boolean);
    } catch {
        return [];
    }
}

function assertLegacyDbWriteTargetAllowed({ scriptName, connectionString, allowNonLocalEnv }) {
    if (!connectionString) {
        throw new Error('DATABASE_URL is required');
    }

    const poolerSignals = getPoolerSignals(connectionString);
    if (poolerSignals.length > 0) {
        throw new Error(
            `${scriptName} cannot run against a pooler-style URL. ` +
            `Signals: ${poolerSignals.join(', ')}. Target: ${redactConnectionString(connectionString)}.`
        );
    }

    if (isLocalDbTarget(connectionString)) return;

    if (process.env[allowNonLocalEnv] !== SCRIPT_DB_NON_LOCAL_CONFIRMATION) {
        throw new Error(
            `${scriptName} writes to DB and only allows local targets by default. ` +
            `Target: ${redactConnectionString(connectionString)}. ` +
            `For a non-local direct DB, set ${allowNonLocalEnv}=${SCRIPT_DB_NON_LOCAL_CONFIRMATION}.`
        );
    }
}

function assertLegacyDbWriteConfirmed({ confirmEnv, confirmation, description }) {
    if (process.env[confirmEnv] !== confirmation) {
        throw new Error(
            `Refusing to ${description} without explicit confirmation. ` +
            `Set ${confirmEnv}=${confirmation} to continue.`
        );
    }
}

module.exports = {
    SCRIPT_DB_NON_LOCAL_CONFIRMATION,
    assertLegacyDbWriteConfirmed,
    assertLegacyDbWriteTargetAllowed,
    redactConnectionString,
};
