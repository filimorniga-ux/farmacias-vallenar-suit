import { NextResponse } from 'next/server';
import { promises as dns } from 'node:dns';
import { Client, type ClientConfig } from 'pg';
import { ADMIN_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
import { logger } from '@/lib/logger';

const DEFAULT_TIMEOUT_MS = 3000;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 10_000;
const VALID_MODES = new Set(['default', 'parse']);

function parseTimeout(value: string | null) {
    if (!value) return DEFAULT_TIMEOUT_MS;

    const timeout = Number.parseInt(value, 10);
    if (!Number.isInteger(timeout) || timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
        return null;
    }

    return timeout;
}

function getDiagnosticDbUrl() {
    return process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || '';
}

export async function GET(req: Request) {
    const auth = await requireApiRoles(ADMIN_API_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const dbUrl = getDiagnosticDbUrl();

    // Test parameters
    const useSsl = searchParams.get('ssl') !== 'false';
    const rejectUnauthorized = searchParams.get('rejectUnauthorized') === 'true';
    const timeout = parseTimeout(searchParams.get('timeout'));
    const mode = searchParams.get('mode') || 'default';

    if (timeout === null) {
        return NextResponse.json(
            {
                success: false,
                error: 'Parámetro timeout inválido',
                code: 'DIAGNOSTIC_INVALID_TIMEOUT',
            },
            { status: 400, headers: API_NO_STORE_HEADERS },
        );
    }

    if (!VALID_MODES.has(mode)) {
        return NextResponse.json(
            {
                success: false,
                error: 'Parámetro mode inválido',
                code: 'DIAGNOSTIC_INVALID_MODE',
            },
            { status: 400, headers: API_NO_STORE_HEADERS },
        );
    }

    if (!dbUrl) {
        return NextResponse.json(
            {
                success: false,
                error: 'Base de datos no configurada para diagnóstico',
                code: 'DIAGNOSTIC_DB_URL_MISSING',
            },
            { status: 503, headers: API_NO_STORE_HEADERS },
        );
    }

    let config: ClientConfig = {
        connectionString: dbUrl,
        connectionTimeoutMillis: timeout,
    };

    if (useSsl) {
        config.ssl = { rejectUnauthorized };
    }

    if (mode === 'parse') {
        let url: URL;
        try {
            url = new URL(dbUrl);
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Target de diagnóstico inválido',
                    code: 'DIAGNOSTIC_DB_URL_INVALID',
                },
                { status: 503, headers: API_NO_STORE_HEADERS },
            );
        }

        // sometimes passing connectionString is not enough if URL has query params
        config = {
            host: url.hostname,
            port: parseInt(url.port || '5432', 10),
            user: url.username,
            password: url.password,
            database: url.pathname.replace('/', ''),
            ssl: { rejectUnauthorized },
            connectionTimeoutMillis: timeout
        };
    }

    const start = Date.now();
    const result: {
        requestedConfig: {
            mode: string;
            ssl: boolean;
            rejectUnauthorized: boolean;
            timeoutMs: number;
        };
        success: boolean;
        connectTime?: number;
        queryTime?: number;
        now?: unknown;
        error?: string;
        totalTime?: number;
        network?: {
            dnsResolved: boolean;
            addressCount?: number;
        };
    } = {
        requestedConfig: {
            mode,
            ssl: useSsl,
            rejectUnauthorized,
            timeoutMs: timeout,
        },
        success: false,
    };

    let client: Client | null = null;
    let connected = false;

    try {
        client = new Client(config);

        await client.connect();
        connected = true;
        result.connectTime = Date.now() - start;

        const res = await client.query('SELECT NOW()');
        result.queryTime = Date.now() - start - result.connectTime;
        result.now = res.rows[0].now;

        result.success = true;
    } catch (error: any) {
        logger.error(
            { error, mode, useSsl, rejectUnauthorized, timeout },
            '[DiagnosticRoute] DB diagnostic failed'
        );
        result.error = 'No fue posible completar el diagnóstico de base de datos';
    } finally {
        if (client && connected) {
            await client.end().catch((error) => {
                logger.warn({ error }, '[DiagnosticRoute] Failed to close diagnostic DB client');
            });
        }
        result.totalTime = Date.now() - start;
    }

    // also resolve DNS directly to check IPv4 vs IPv6
    try {
        const url = new URL(dbUrl);
        const lookup = await dns.lookup(url.hostname, { all: true });
        result.network = {
            dnsResolved: true,
            addressCount: lookup.length,
        };
    } catch (e: any) {
        result.network = {
            dnsResolved: false,
        };
    }

    return NextResponse.json(result, { headers: API_NO_STORE_HEADERS });
}
