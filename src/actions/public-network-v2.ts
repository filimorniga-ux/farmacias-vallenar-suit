'use server';

/**
 * ============================================================================
 * PUBLIC-NETWORK-V2: Ubicaciones Públicas Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limit 10/min por IP
 * - no-store para evitar caché compartido accidental
 * - Sanitización de output
 */

import * as Sentry from '@sentry/nextjs';
import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import { classifyPgError } from '@/lib/db-errors';
import { createCorrelationId, type ActionFailure } from '@/lib/action-response';
import { logger } from '@/lib/logger';

export interface PublicLocation {
    id: string;
    name: string;
    address: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
}

export type PublicLocationsResult =
    | { success: true; data: PublicLocation[] }
    | ActionFailure;

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const publicNetworkRateLimits = new Map<string, { count: number; resetAt: number }>();

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers();
        return headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
            || headersList.get('x-real-ip')
            || 'unknown';
    } catch {
        return 'unknown';
    }
}

function checkPublicNetworkRateLimit(ip: string): boolean {
    const now = Date.now();
    const key = `public-network:${ip}`;
    const entry = publicNetworkRateLimits.get(key);

    if (!entry || now > entry.resetAt) {
        publicNetworkRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
}

function sanitizePublicLocationText(value: unknown) {
    return String(value || '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
}

export async function getPublicLocationsSecure(): Promise<PublicLocationsResult> {
    noStore();

    const correlationId = createCorrelationId();
    const start = Date.now();
    const ip = await getClientIP();

    if (!checkPublicNetworkRateLimit(ip)) {
        logger.warn(
            {
                correlationId,
                ip,
                elapsedMs: Date.now() - start,
            },
            'Public locations rate limit exceeded'
        );

        return {
            success: false,
            error: 'Demasiadas consultas. Espere un momento.',
            code: 'PUBLIC_NETWORK_RATE_LIMIT',
            retryable: true,
            correlationId,
            userMessage: 'Demasiadas consultas. Espere un momento.',
        };
    }

    try {
        const res = await query(`
            SELECT id, name, address, type 
            FROM locations 
            WHERE (is_active = true OR is_active IS NULL)
              AND type = 'STORE'
            ORDER BY name ASC
        `);

        const data = res.rows.filter((row: any) => row.type === 'STORE').map((row: any) => ({
            id: row.id,
            name: sanitizePublicLocationText(row.name),
            address: sanitizePublicLocationText(row.address),
            type: row.type,
        }));

        logger.info(
            {
                correlationId,
                count: data.length,
                elapsedMs: Date.now() - start,
            },
            'Public locations fetched'
        );

        return { success: true, data };

    } catch (error) {
        const classified = classifyPgError(error);

        Sentry.captureException(error, {
            tags: {
                module: 'public-network-v2',
                action: 'getPublicLocationsSecure',
                code: classified.code,
            },
            extra: {
                correlationId,
                retryable: classified.retryable,
                elapsedMs: Date.now() - start,
            },
        });

        logger.error(
            {
                correlationId,
                code: classified.code,
                retryable: classified.retryable,
                technicalMessage: classified.technicalMessage,
                elapsedMs: Date.now() - start,
            },
            'Public locations fetch failed'
        );

        return {
            success: false,
            error: classified.userMessage,
            code: classified.code,
            retryable: classified.retryable,
            correlationId,
            userMessage: classified.userMessage,
        };
    }
}
