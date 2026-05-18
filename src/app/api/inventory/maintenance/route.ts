import { NextResponse } from 'next/server';
import type { PoolClient } from 'pg';

import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ROLE_GROUPS, validatePinForRoles } from '@/lib/pin-rbac';

const VALID_ACTIONS = new Set(['TRUNCATE', 'UNDO_IMPORT', 'ANALYZE_DUPLICATES']);
const DESTRUCTIVE_ACTIONS = new Set(['TRUNCATE', 'UNDO_IMPORT']);
const DESTRUCTIVE_MAINTENANCE_ROLES = new Set(['ADMIN', 'GERENTE_GENERAL']);
const MAX_MAINTENANCE_BODY_BYTES = 16 * 1024;
const DESTRUCTIVE_CONFIRMATION_CODES: Record<string, string> = {
    TRUNCATE: 'BORRAR',
    UNDO_IMPORT: 'DESHACER',
};

function getDeclaredContentLength(request: Request) {
    const raw = request.headers.get('content-length');
    if (!raw) return null;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function canRunDestructiveMaintenance(role: string) {
    return DESTRUCTIVE_MAINTENANCE_ROLES.has(role);
}

function isDestructiveMaintenanceAction(action: string) {
    return DESTRUCTIVE_ACTIONS.has(action);
}

function isValidAdminPin(pin: unknown) {
    return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

function getRequiredConfirmationCode(action: string) {
    return DESTRUCTIVE_CONFIRMATION_CODES[action] || null;
}

async function resetProductsStockSummary(
    client: PoolClient,
    productIds?: string[],
) {
    if (productIds && productIds.length > 0) {
        await client.query(
            `
                UPDATE products p
                SET stock_total = COALESCE(t.total_stock, 0),
                    stock_actual = COALESCE(t.total_stock, 0),
                    updated_at = NOW()
                FROM (
                    SELECT product_id::text AS product_id, COALESCE(SUM(quantity_real), 0) AS total_stock
                    FROM inventory_batches
                    WHERE product_id::text = ANY($1::text[])
                    GROUP BY product_id::text
                ) t
                WHERE p.id::text = t.product_id
            `,
            [productIds],
        );

        await client.query(
            `
                UPDATE products
                SET stock_total = 0,
                    stock_actual = 0,
                    updated_at = NOW()
                WHERE id::text = ANY($1::text[])
                  AND NOT EXISTS (
                      SELECT 1
                      FROM inventory_batches ib
                      WHERE ib.product_id::text = products.id::text
                  )
            `,
            [productIds],
        );

        return;
    }

    await client.query(
        `
            UPDATE products p
            SET stock_total = COALESCE(t.total_stock, 0),
                stock_actual = COALESCE(t.total_stock, 0),
                updated_at = NOW()
            FROM (
                SELECT product_id::text AS product_id, COALESCE(SUM(quantity_real), 0) AS total_stock
                FROM inventory_batches
                GROUP BY product_id::text
            ) t
            WHERE p.id::text = t.product_id
        `,
    );

    await client.query(
        `
            UPDATE products
            SET stock_total = 0,
                stock_actual = 0,
                updated_at = NOW()
            WHERE NOT EXISTS (
                SELECT 1
                FROM inventory_batches ib
                WHERE ib.product_id::text = products.id::text
            )
        `,
    );
}

export async function POST(request: Request) {
    const auth = await requireApiRoles(OPERATIONS_API_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    const declaredContentLength = getDeclaredContentLength(request);
    if (declaredContentLength !== null && declaredContentLength > MAX_MAINTENANCE_BODY_BYTES) {
        return NextResponse.json(
            {
                success: false,
                error: 'Payload de mantenimiento demasiado grande',
                code: 'MAINTENANCE_BODY_TOO_LARGE',
            },
            { status: 413, headers: API_NO_STORE_HEADERS },
        );
    }

    const body = await request.json().catch(() => ({}));
    const { action, confirmation, adminPin } = body;

    if (!action || !VALID_ACTIONS.has(action)) {
        return NextResponse.json({ error: 'Action is required' }, { status: 400, headers: API_NO_STORE_HEADERS });
    }

    if (isDestructiveMaintenanceAction(action) && !canRunDestructiveMaintenance(auth.session.role)) {
        logger.warn(
            { action, actorUserId: auth.session.userId, actorRole: auth.session.role },
            '[MaintenanceRoute] Destructive maintenance action denied'
        );
        return NextResponse.json(
            {
                success: false,
                error: 'Acción destructiva restringida a administradores',
                code: 'MAINTENANCE_DESTRUCTIVE_FORBIDDEN',
            },
            { status: 403, headers: API_NO_STORE_HEADERS },
        );
    }

    const requiredConfirmationCode = getRequiredConfirmationCode(action);
    if (requiredConfirmationCode && confirmation !== requiredConfirmationCode) {
        return NextResponse.json(
            {
                success: false,
                error: 'Código de confirmación inválido',
                code: 'MAINTENANCE_CONFIRMATION_REQUIRED',
            },
            { status: 403, headers: API_NO_STORE_HEADERS },
        );
    }

    if (isDestructiveMaintenanceAction(action) && !isValidAdminPin(adminPin)) {
        return NextResponse.json(
            {
                success: false,
                error: 'PIN administrador requerido',
                code: 'MAINTENANCE_ADMIN_PIN_REQUIRED',
            },
            { status: 403, headers: API_NO_STORE_HEADERS },
        );
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        logger.info(
            { action, actorUserId: auth.session.userId, actorRole: auth.session.role },
            '[MaintenanceRoute] Executing maintenance action'
        );

        if (isDestructiveMaintenanceAction(action)) {
            const destructiveAdminPin = typeof adminPin === 'string' ? adminPin : '';
            const pinCheck = await validatePinForRoles(client, destructiveAdminPin, ROLE_GROUPS.ADMIN, {
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            });

            if (!pinCheck.valid) {
                logger.warn(
                    { action, actorUserId: auth.session.userId, actorRole: auth.session.role, code: pinCheck.code },
                    '[MaintenanceRoute] Destructive maintenance PIN denied'
                );
                return NextResponse.json(
                    {
                        success: false,
                        error: pinCheck.error,
                        code: pinCheck.code,
                    },
                    { status: 403, headers: API_NO_STORE_HEADERS },
                );
            }
        }

        if (action === 'TRUNCATE') {
            await client.query('BEGIN');
            transactionStarted = true;

            await client.query('DELETE FROM inventory_batches');
            await resetProductsStockSummary(client);

            await client.query('COMMIT');
            transactionStarted = false;

            logger.warn(
                { actorUserId: auth.session.userId, actorRole: auth.session.role },
                '[MaintenanceRoute] Canonical inventory truncate completed'
            );
            return NextResponse.json(
                { success: true, message: 'Inventario vaciado correctamente.' },
                { headers: API_NO_STORE_HEADERS },
            );
        }

        if (action === 'UNDO_IMPORT') {
            await client.query('BEGIN');
            transactionStarted = true;

            const deletedRes = await client.query(
                `
                    WITH deleted_batches AS (
                        DELETE FROM inventory_batches
                        WHERE created_at > NOW() - INTERVAL '10 minutes'
                        RETURNING product_id::text AS product_id
                    )
                    SELECT
                        COUNT(*)::int AS deleted_count,
                        ARRAY_REMOVE(array_agg(DISTINCT product_id), NULL) AS product_ids
                    FROM deleted_batches
                `,
            );

            const deletedCount = Number(deletedRes.rows[0]?.deleted_count || 0);
            const productIds = Array.isArray(deletedRes.rows[0]?.product_ids)
                ? deletedRes.rows[0].product_ids.map((id: unknown) => String(id))
                : [];

            await resetProductsStockSummary(client, productIds);

            await client.query('COMMIT');
            transactionStarted = false;

            logger.warn(
                { actorUserId: auth.session.userId, actorRole: auth.session.role, deletedCount },
                '[MaintenanceRoute] Canonical undo import completed'
            );
            return NextResponse.json({
                success: true,
                message: `Se revirtieron ${deletedCount} lotes creados en los últimos 10 minutos.`,
            }, { headers: API_NO_STORE_HEADERS });
        }

        const res = await client.query(
            `
                SELECT sku, COUNT(*) as count, array_agg(id) as ids
                FROM products
                GROUP BY sku
                HAVING COUNT(*) > 1
                LIMIT 50
            `,
        );

        return NextResponse.json({
            success: true,
            duplicates: res.rows,
        }, { headers: API_NO_STORE_HEADERS });
    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }
        logger.error(
            { error, actorUserId: auth.session.userId, actorRole: auth.session.role },
            '[MaintenanceRoute] Maintenance action failed'
        );
        return NextResponse.json(
            { error: 'Maintenance action failed', code: 'MAINTENANCE_ACTION_FAILED' },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    } finally {
        client.release();
    }
}
