import * as Sentry from '@sentry/nextjs';
import { query, pool } from '@/lib/db';
import { HEALTHCHECK_NO_STORE_HEADERS } from '@/lib/api-health';
import { classifyPgError } from '@/lib/db-errors';
import { createCorrelationId } from '@/lib/action-response';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
    const expectedToken = process.env.HEALTHCHECK_TOKEN;

    // If token is not configured, fail closed in production and open in development.
    if (!expectedToken) {
        return process.env.NODE_ENV !== 'production';
    }

    const tokenFromHeader = request.headers.get('x-health-token');
    return tokenFromHeader === expectedToken;
}

export async function GET(request: NextRequest) {
    const correlationId = createCorrelationId();

    if (!isAuthorized(request)) {
        return NextResponse.json(
            {
                success: false,
                error: 'Unauthorized',
                code: 'HEALTH_UNAUTHORIZED',
                correlationId,
            },
            { status: 401, headers: HEALTHCHECK_NO_STORE_HEADERS }
        );
    }

    const start = Date.now();

    try {
        const dbStart = Date.now();
        const ping = await query('SELECT NOW() as server_time');
        const dbLatencyMs = Date.now() - dbStart;

        return NextResponse.json({
            success: true,
            status: 'ok',
            correlationId,
            elapsedMs: Date.now() - start,
            dbLatencyMs,
            timestamp: ping.rows[0]?.server_time || null,
        }, { headers: HEALTHCHECK_NO_STORE_HEADERS });
    } catch (error) {
        const classified = classifyPgError(error);

        Sentry.captureException(error, {
            tags: {
                module: 'health-db',
                code: classified.code,
            },
            extra: {
                correlationId,
                retryable: classified.retryable,
                technicalMessage: classified.technicalMessage,
            },
        });

        logger.error(
            {
                correlationId,
                code: classified.code,
                retryable: classified.retryable,
                technicalMessage: classified.technicalMessage,
                elapsedMs: Date.now() - start,
                pool: {
                    total: pool.totalCount,
                    idle: pool.idleCount,
                    waiting: pool.waitingCount,
                },
            },
            'DB healthcheck failed'
        );

        return NextResponse.json(
            {
                success: false,
                status: 'degraded',
                code: classified.code,
                retryable: classified.retryable,
                correlationId,
                userMessage: classified.userMessage,
                elapsedMs: Date.now() - start,
            },
            { status: 503, headers: HEALTHCHECK_NO_STORE_HEADERS }
        );
    }
}
