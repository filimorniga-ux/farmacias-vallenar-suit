import { NextResponse } from 'next/server';

import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

const VALID_ACTIONS = new Set(['ANALYZE_DUPLICATES']);
const MAX_DEDUPLICATE_BODY_BYTES = 8 * 1024;

function getDeclaredContentLength(request: Request) {
    const raw = request.headers.get('content-length');
    if (!raw) return null;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(request: Request) {
    try {
        const auth = await requireApiRoles(OPERATIONS_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        const declaredContentLength = getDeclaredContentLength(request);
        if (declaredContentLength !== null && declaredContentLength > MAX_DEDUPLICATE_BODY_BYTES) {
            return NextResponse.json(
                {
                    error: 'Payload de análisis demasiado grande',
                    code: 'DEDUPLICATE_BODY_TOO_LARGE',
                },
                { status: 413, headers: API_NO_STORE_HEADERS },
            );
        }

        const body = await request.json().catch(() => ({}));
        const action = typeof body.action === 'string' ? body.action : 'ANALYZE_DUPLICATES';

        if (action === 'MERGE_DUPLICATES') {
            return NextResponse.json(
                {
                    error: 'Fusión automática de duplicados deshabilitada. Revise los duplicados en modo solo lectura.',
                    code: 'DEDUPLICATE_MERGE_LEGACY_DISABLED',
                },
                { status: 410, headers: API_NO_STORE_HEADERS },
            );
        }

        if (!VALID_ACTIONS.has(action)) {
            return NextResponse.json({ error: 'Acción no válida' }, { status: 400, headers: API_NO_STORE_HEADERS });
        }

        const client = await pool.connect();
        try {
            const duplicatesQuery = `
                SELECT sku, COUNT(*) as count, array_agg(id) as ids
                FROM products
                GROUP BY sku
                HAVING COUNT(*) > 1
            `;
            const { rows: duplicateGroups } = await client.query(duplicatesQuery);

            if (action === 'ANALYZE_DUPLICATES') {
                const stats = duplicateGroups.map(g => ({
                    sku: g.sku,
                    count: g.count,
                    name: 'Producto Duplicado'
                }));
                return NextResponse.json({
                    success: true,
                    duplicates: stats,
                    message: `Se encontraron ${duplicateGroups.length} grupos de duplicados.`
                }, { headers: API_NO_STORE_HEADERS });
            }
        } finally {
            client.release();
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400, headers: API_NO_STORE_HEADERS });

    } catch (error) {
        logger.error({ error }, '[InventoryDeduplicateRoute] Deduplicate failed');
        return NextResponse.json(
            { error: 'Error al procesar duplicados', code: 'DEDUPLICATE_FAILED' },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    }
}
