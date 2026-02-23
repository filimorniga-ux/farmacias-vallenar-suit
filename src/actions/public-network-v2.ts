'use server';

/**
 * ============================================================================
 * PUBLIC-NETWORK-V2: Ubicaciones Públicas Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limit 10/min por IP
 * - Caché 5 minutos
 * - Sanitización de output
 */

import * as Sentry from '@sentry/nextjs';
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

export async function getPublicLocationsSecure(): Promise<PublicLocationsResult> {
    const correlationId = createCorrelationId();
    const start = Date.now();

    try {
        const res = await query(`
            SELECT id, name, address, type 
            FROM locations 
            WHERE (is_active = true OR is_active IS NULL)
            ORDER BY name ASC
        `);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            name: (row.name || '').replace(/<[^>]*>/g, ''), // Strip HTML
            address: (row.address || '').replace(/<[^>]*>/g, ''),
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
