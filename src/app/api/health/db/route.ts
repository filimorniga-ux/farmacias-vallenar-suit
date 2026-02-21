import * as Sentry from '@sentry/nextjs';
import { query, pool } from '@/lib/db';
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
    const tokenFromQuery = request.nextUrl.searchParams.get('token');
    return tokenFromHeader === expectedToken || tokenFromQuery === expectedToken;
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
            { status: 401 }
        );
    }

    const start = Date.now();

    try {
        const dbStart = Date.now();
        const ping = await query('SELECT NOW() as server_time, current_database() as database_name, current_user as db_user');
        const dbLatencyMs = Date.now() - dbStart;

        return NextResponse.json({
            success: true,
            status: 'ok',
            correlationId,
            elapsedMs: Date.now() - start,
            dbLatencyMs,
            timestamp: ping.rows[0]?.server_time || null,
            database: ping.rows[0]?.database_name || null,
            dbUser: ping.rows[0]?.db_user || null,
            pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount,
            },
            env: process.env.NODE_ENV,
        });
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
                technicalMessage: classified.technicalMessage,
                elapsedMs: Date.now() - start,
            },
            { status: 503 }
        );
    }
}
