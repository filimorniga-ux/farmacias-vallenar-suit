import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function isAuthorized(request: NextRequest) {
    const expectedToken = process.env.HEALTHCHECK_TOKEN;

    if (!expectedToken) {
        return process.env.NODE_ENV !== 'production';
    }

    const tokenFromHeader = request.headers.get('x-health-token');
    const tokenFromQuery = request.nextUrl.searchParams.get('token');
    return tokenFromHeader === expectedToken || tokenFromQuery === expectedToken;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            {
                success: false,
                error: 'Unauthorized',
                code: 'HEALTH_UNAUTHORIZED',
            },
            { status: 401 }
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
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            database: {
                connected: true,
                latencyMs: dbLatency,
                poolTotal: pool.totalCount,
                poolIdle: pool.idleCount,
                poolWaiting: pool.waitingCount
            },
            version: process.env.npm_package_version || '1.0.0'
        }, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error: any) {
        console.error('❌ Health Check Failed:', error);
        return NextResponse.json(
            {
                status: 'unhealthy',
                error: 'Database connection failed',
                details: error.message,
                timestamp: new Date().toISOString()
            },
            { status: 503 }
        );
    }
}
