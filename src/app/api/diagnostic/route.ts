import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const dbUrl = process.env.DATABASE_URL || '';

    // Test parameters
    const useSsl = searchParams.get('ssl') !== 'false';
    const rejectUnauthorized = searchParams.get('rejectUnauthorized') === 'true';
    const timeout = parseInt(searchParams.get('timeout') || '3000', 10);
    const mode = searchParams.get('mode') || 'default';

    let config: any = {
        connectionString: dbUrl,
        connectionTimeoutMillis: timeout,
    };

    if (useSsl) {
        config.ssl = { rejectUnauthorized };
    }

    if (mode === 'parse') {
        // sometimes passing connectionString is not enough if URL has query params
        const url = new URL(dbUrl);
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
    const result: any = {
        config_used: { ...config, connectionString: config.connectionString ? 'REDACTED' : undefined, password: 'REDACTED' },
        time: 0,
        success: false,
    };

    try {
        const client = new Client(config);

        await client.connect();
        result.connectTime = Date.now() - start;

        const res = await client.query('SELECT NOW()');
        result.queryTime = Date.now() - start - result.connectTime;
        result.now = res.rows[0].now;

        await client.end();
        result.success = true;
    } catch (error: any) {
        result.error = error.message;
        result.code = error.code;
        result.stack = error.stack;
    } finally {
        result.totalTime = Date.now() - start;
    }

    // also resolve DNS directly to check IPv4 vs IPv6
    try {
        const dns = require('dns').promises;
        const url = new URL(dbUrl);
        const lookup = await dns.lookup(url.hostname, { all: true });
        result.dns = lookup;
    } catch (e: any) {
        result.dnsError = e.message;
    }

    return NextResponse.json(result);
}
