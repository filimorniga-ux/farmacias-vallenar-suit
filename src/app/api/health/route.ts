import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { HEALTHCHECK_NO_STORE_HEADERS } from '@/lib/api-health';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
    const expectedToken = process.env.HEALTHCHECK_TOKEN;

    if (!expectedToken) {
        return process.env.NODE_ENV !== 'production';
    }

    const tokenFromHeader = request.headers.get('x-health-token');
    return tokenFromHeader === expectedToken;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            {
                success: false,
                error: 'Unauthorized',
                code: 'HEALTH_UNAUTHORIZED',
            },
            { status: 401, headers: HEALTHCHECK_NO_STORE_HEADERS }
        );
    }

    try {
        // Medir latencia de DB
        const start = Date.now();
        await pool.query('SELECT 1');
        const dbLatency = Date.now() - start;

        return NextResponse.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                latencyMs: dbLatency,
            },
        }, {
            status: 200,
            headers: HEALTHCHECK_NO_STORE_HEADERS
        });
    } catch (error: any) {
        console.error('❌ Health Check Failed:', error);
        return NextResponse.json(
            {
                status: 'unhealthy',
                error: 'Database connection failed',
                timestamp: new Date().toISOString()
            },
            { status: 503, headers: HEALTHCHECK_NO_STORE_HEADERS }
        );
    }
}
