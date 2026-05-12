import { redactConnectionString } from './e2e-release-critical-db-policy';

export const SCRIPT_DB_NON_LOCAL_CONFIRMATION = 'APLICAR';

export type ScriptDbWriteTargetPolicyInput = {
    scriptName: string;
    connectionString?: string;
    allowNonLocalEnv: string;
    env?: Record<string, string | undefined>;
};

function parseConnectionString(connectionString: string) {
    try {
        return new URL(connectionString);
    } catch {
        return null;
    }
}

function isLocalDbTarget(connectionString: string) {
    const parsed = parseConnectionString(connectionString);
    if (!parsed) {
        return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    }

    return parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';
}

function getPoolerSignals(connectionString: string) {
    const parsed = parseConnectionString(connectionString);
    if (!parsed) {
        return [];
    }

    return [
        parsed.hostname.includes('pooler.supabase.com') ? 'host pooler.supabase.com' : null,
        parsed.searchParams.get('pgbouncer') === 'true' ? 'pgbouncer=true' : null,
        parsed.searchParams.get('connection_limit') === '1' ? 'connection_limit=1' : null,
    ].filter((signal): signal is string => Boolean(signal));
}

export function getScriptDbWriteTargetIssue(input: ScriptDbWriteTargetPolicyInput): string | null {
    const connectionString = input.connectionString?.trim();
    if (!connectionString) {
        return 'DATABASE_URL no está configurada';
    }

    const poolerSignals = getPoolerSignals(connectionString);
    if (poolerSignals.length > 0) {
        return [
            `${input.scriptName} no puede ejecutar escrituras contra una URL tipo pooler.`,
            `Señales detectadas: ${poolerSignals.join(', ')}.`,
            `Target: ${redactConnectionString(connectionString)}.`,
            'Usa una URL non-pooling directa o una DB local/rehearsal.',
        ].join(' ');
    }

    if (isLocalDbTarget(connectionString)) {
        return null;
    }

    const confirmation = input.env?.[input.allowNonLocalEnv] || process.env[input.allowNonLocalEnv];
    if (confirmation === SCRIPT_DB_NON_LOCAL_CONFIRMATION) {
        return null;
    }

    return [
        `${input.scriptName} escribe en DB y solo permite targets locales por defecto.`,
        `Target: ${redactConnectionString(connectionString)}.`,
        `Para una DB no local, define ${input.allowNonLocalEnv}=${SCRIPT_DB_NON_LOCAL_CONFIRMATION}.`,
    ].join(' ');
}

export function assertScriptDbWriteTargetAllowed(input: ScriptDbWriteTargetPolicyInput): asserts input is ScriptDbWriteTargetPolicyInput & { connectionString: string } {
    const issue = getScriptDbWriteTargetIssue(input);
    if (issue) {
        throw new Error(issue);
    }
}
