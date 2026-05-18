'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getClient } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ROLE_GROUPS, validatePinForRoles } from '@/lib/pin-rbac';
import {
    ensureBatchInInventoryScope,
    ensureProductInInventoryScope,
    hasGlobalInventoryScope,
    INVENTORY_DELETE_ROLES,
    requireInventoryActor,
    type InventoryActor,
} from '@/actions/inventory-scope';

const DeleteProductSchema = z.object({
    productId: z.string().uuid('ID de producto inválido'),
    userId: z.string().min(1, 'ID de usuario inválido'),
    managerPin: z.string().min(4, 'PIN requerido'),
});

type DeleteTarget =
    | { mode: 'product'; productId: string; locationId?: string }
    | { mode: 'batch-only'; batchId: string; locationId?: string };

async function resolveDeleteTarget(
    client: Awaited<ReturnType<typeof getClient>>,
    targetId: string,
    actor: InventoryActor,
): Promise<{ success: true; target: DeleteTarget } | { success: false; error: string }> {
    const batchScope = await ensureBatchInInventoryScope(targetId, actor, client);
    if (batchScope.success) {
        const productId = String(batchScope.batch.product_id || '');
        if (productId) {
            return {
                success: true,
                target: {
                    mode: 'product',
                    productId,
                    locationId: batchScope.locationId,
                },
            };
        }

        return {
            success: true,
            target: {
                mode: 'batch-only',
                batchId: String(batchScope.batch.id || targetId),
                locationId: batchScope.locationId,
            },
        };
    }

    if (batchScope.error !== 'Lote no encontrado') {
        return batchScope;
    }

    const productScope = await ensureProductInInventoryScope(targetId, actor, client);
    if (!productScope.success) {
        return {
            success: false,
            error: productScope.error === 'Producto no encontrado'
                ? 'Producto o lote no encontrado'
                : productScope.error,
        };
    }

    return {
        success: true,
        target: {
            mode: 'product',
            productId: String(productScope.product.id || targetId),
            locationId: productScope.locationId,
        },
    };
}

async function ensureProductLotsInScope(
    client: Awaited<ReturnType<typeof getClient>>,
    productId: string,
    actor: InventoryActor,
) {
    if (hasGlobalInventoryScope(actor.role)) {
        return { success: true as const };
    }

    const res = await client.query(
        `
            SELECT 1
            FROM inventory_batches ib
            LEFT JOIN warehouses w ON ib.warehouse_id::text = w.id::text
            WHERE ib.product_id::text = $1::text
              AND COALESCE(w.location_id::text, ib.location_id::text) <> $2::text
            LIMIT 1
        `,
        [productId, actor.locationId || ''],
    );

    if ((res.rowCount ?? 0) > 0) {
        return {
            success: false as const,
            error: 'El producto tiene lotes fuera de tu ubicación y no puede eliminarse desde este contexto',
        };
    }

    return { success: true as const };
}

export async function deleteProductSecure(
    productId: string,
    userId: string,
    managerPin: string,
): Promise<{ success: boolean; error?: string }> {
    const validated = DeleteProductSchema.safeParse({ productId, userId, managerPin });
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0].message,
        };
    }

    const actorResult = await requireInventoryActor(INVENTORY_DELETE_ROLES, 'deleteProductSecure');
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const actor = actorResult.actor;
    if (validated.data.userId !== actor.userId) {
        logger.warn(
            {
                requestedUserId: validated.data.userId,
                actorUserId: actor.userId,
                action: 'deleteProductSecure',
            },
            'Ignoring payload userId in deleteProductSecure; using validated session user',
        );
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        const pinResult = await validatePinForRoles(client, validated.data.managerPin, ROLE_GROUPS.MANAGER, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!pinResult.valid) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: 'PIN de Gerente o Administrador incorrecto',
            };
        }

        const resolvedTarget = await resolveDeleteTarget(client, validated.data.productId, actor);
        if (!resolvedTarget.success) {
            await client.query('ROLLBACK');
            return { success: false, error: resolvedTarget.error };
        }

        const target = resolvedTarget.target;
        const authorizedUser = pinResult.authorizedBy;

        if (target.mode === 'product') {
            const lotsScope = await ensureProductLotsInScope(client, target.productId, actor);
            if (!lotsScope.success) {
                await client.query('ROLLBACK');
                return { success: false, error: lotsScope.error };
            }

            const dependenciesCheck = await client.query(
                `
                    SELECT 1
                    FROM sale_items si
                    JOIN inventory_batches ib ON si.batch_id::text = ib.id::text
                    WHERE ib.product_id::text = $1::text
                    LIMIT 1
                `,
                [target.productId],
            );

            const hasSales = (dependenciesCheck.rowCount || 0) > 0;

            if (hasSales) {
                await client.query(
                    `
                        UPDATE products
                        SET is_active = false,
                            deactivated_at = NOW(),
                            deactivation_reason = 'Archivado por usuario (tiene ventas históricas)',
                            updated_at = NOW()
                        WHERE id::text = $1::text
                    `,
                    [target.productId],
                );

                await client.query(
                    `
                        UPDATE inventory_batches
                        SET is_active = false,
                            updated_at = NOW()
                        WHERE product_id::text = $1::text
                    `,
                    [target.productId],
                );

                await client.query(
                    `
                        INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                        VALUES ($1::uuid, 'PRODUCT_ARCHIVED', 'PRODUCT', $2::uuid, $3::jsonb, NOW())
                    `,
                    [
                        actor.userId,
                        target.productId,
                        JSON.stringify({
                            reason: 'Has Sales History',
                            authorized_by: authorizedUser.name,
                            authorized_role: authorizedUser.role,
                        }),
                    ],
                );
            } else {
                await client.query(
                    'DELETE FROM inventory_batches WHERE product_id::text = $1::text',
                    [target.productId],
                );

                await client.query(
                    'DELETE FROM products WHERE id::text = $1::text',
                    [target.productId],
                );

                await client.query(
                    `
                        INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                        VALUES ($1::uuid, 'PRODUCT_DELETE', 'PRODUCT', $2::uuid, $3::jsonb, NOW())
                    `,
                    [
                        actor.userId,
                        target.productId,
                        JSON.stringify({
                            authorized_by: authorizedUser.name,
                            authorized_role: authorizedUser.role,
                        }),
                    ],
                );
            }
        } else {
            const dependenciesCheck = await client.query(
                'SELECT 1 FROM sale_items WHERE batch_id::text = $1::text LIMIT 1',
                [target.batchId],
            );

            const hasSales = (dependenciesCheck.rowCount || 0) > 0;

            if (hasSales) {
                await client.query(
                    `
                        UPDATE inventory_batches
                        SET is_active = false,
                            updated_at = NOW()
                        WHERE id::text = $1::text
                    `,
                    [target.batchId],
                );
            } else {
                await client.query(
                    'DELETE FROM inventory_batches WHERE id::text = $1::text',
                    [target.batchId],
                );
            }

            await client.query(
                `
                    INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                    VALUES ($1::uuid, $2, 'INVENTORY_BATCH', $3::uuid, $4::jsonb, NOW())
                `,
                [
                    actor.userId,
                    hasSales ? 'BATCH_ARCHIVED' : 'BATCH_DELETE',
                    target.batchId,
                    JSON.stringify({
                        authorized_by: authorizedUser.name,
                        authorized_role: authorizedUser.role,
                    }),
                ],
            );
        }

        await client.query('COMMIT');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error, productId }, '[DELETE_PRODUCT] Error');

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al procesar la eliminación del producto',
        };
    } finally {
        client.release();
    }
}
