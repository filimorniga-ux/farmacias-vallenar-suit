import 'server-only';

import { query } from '@/lib/db';
import {
    getActorOrFail,
    normalizeRole,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    type PinRbacActor,
} from '@/lib/pin-rbac';
import {
    getWarehouseLocationId,
    resolveScopedLocation,
} from './scoped-location';

type Queryable = {
    query: (sql: string, params?: Array<string | number | boolean | Date | string[] | null | undefined>) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export type InventoryActor = PinRbacActor;

export const INVENTORY_GLOBAL_ROLES = ROLE_GROUPS.ADMIN;
export const INVENTORY_READ_ROLES = [
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;
export const INVENTORY_WRITE_ROLES = INVENTORY_READ_ROLES;
export const INVENTORY_DELETE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

function asQueryable(executor?: Queryable) {
    return executor ?? { query };
}

export function hasGlobalInventoryScope(role: string) {
    return INVENTORY_GLOBAL_ROLES.includes(
        normalizeRole(role) as typeof INVENTORY_GLOBAL_ROLES[number],
    );
}

export async function requireInventoryActor(
    allowedRoles: readonly string[],
    action = 'inventory-operation',
): Promise<{ success: true; actor: InventoryActor } | { success: false; error: string }> {
    try {
        const actor = requireRole(await getActorOrFail(), allowedRoles);
        return { success: true, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return {
                success: false,
                error: error.code === 'AUTH_UNAUTHORIZED'
                    ? 'Sesión no válida. Vuelve a iniciar sesión.'
                    : 'Acceso denegado',
            };
        }

        return { success: false, error: `Error resolviendo actor para ${action}` };
    }
}

export function resolveEffectiveInventoryLocation(
    actor: InventoryActor,
    requestedLocationId?: string | null,
): { success: true; locationId?: string } | { success: false; error: string } {
    return resolveScopedLocation(actor, requestedLocationId, hasGlobalInventoryScope);
}

export async function ensureWarehouseInInventoryScope(
    warehouseId: string,
    actor: InventoryActor,
    executor?: Queryable,
): Promise<{ success: true; locationId: string } | { success: false; error: string }> {
    const locationId = await getWarehouseLocationId(warehouseId, asQueryable(executor));
    if (!locationId) {
        return { success: false, error: 'Bodega no encontrada' };
    }

    const scope = resolveEffectiveInventoryLocation(actor, locationId);
    if (!scope.success) {
        return scope;
    }

    return { success: true, locationId };
}

export async function resolveWarehouseForInventoryActor(
    actor: InventoryActor,
    requestedWarehouseId?: string | null,
    requestedLocationId?: string | null,
    executor?: Queryable,
): Promise<{ success: true; warehouseId: string; locationId?: string } | { success: false; error: string }> {
    const db = asQueryable(executor);

    if (requestedWarehouseId) {
        const warehouseScope = await ensureWarehouseInInventoryScope(requestedWarehouseId, actor, db);
        if (!warehouseScope.success) {
            return warehouseScope;
        }

        if (requestedLocationId && requestedLocationId !== warehouseScope.locationId) {
            return { success: false, error: 'La bodega no pertenece a la ubicación indicada' };
        }

        return {
            success: true,
            warehouseId: requestedWarehouseId,
            locationId: warehouseScope.locationId,
        };
    }

    const locationScope = resolveEffectiveInventoryLocation(actor, requestedLocationId || undefined);
    if (!locationScope.success) {
        return locationScope;
    }

    const effectiveLocationId = locationScope.locationId;
    if (!effectiveLocationId) {
        const anyWarehouseRes = await db.query(
            'SELECT id::text AS id, location_id::text AS location_id FROM warehouses ORDER BY id ASC LIMIT 1',
        );

        const warehouseId = String(anyWarehouseRes.rows[0]?.id || '');
        if (!warehouseId) {
            return { success: false, error: 'No hay bodegas configuradas' };
        }

        return {
            success: true,
            warehouseId,
            locationId: String(anyWarehouseRes.rows[0]?.location_id || '') || undefined,
        };
    }

    const defaultWarehouseRes = await db.query(
        `
            SELECT COALESCE(default_warehouse_id::text, '') AS default_warehouse_id
            FROM locations
            WHERE id::text = $1::text
            LIMIT 1
        `,
        [effectiveLocationId],
    );

    const defaultWarehouseId = String(defaultWarehouseRes.rows[0]?.default_warehouse_id || '');
    if (defaultWarehouseId) {
        return {
            success: true,
            warehouseId: defaultWarehouseId,
            locationId: effectiveLocationId,
        };
    }

    const warehouseRes = await db.query(
        `
            SELECT id::text AS id
            FROM warehouses
            WHERE location_id::text = $1::text
            ORDER BY id ASC
            LIMIT 1
        `,
        [effectiveLocationId],
    );

    const warehouseId = String(warehouseRes.rows[0]?.id || '');
    if (!warehouseId) {
        return { success: false, error: 'No se encontró bodega para la ubicación solicitada' };
    }

    return {
        success: true,
        warehouseId,
        locationId: effectiveLocationId,
    };
}

export async function ensureBatchInInventoryScope(
    batchId: string,
    actor: InventoryActor,
    executor?: Queryable,
): Promise<
    | { success: true; batch: Record<string, unknown>; locationId?: string; warehouseId?: string }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const batchRes = await db.query(
        `
            SELECT
                ib.*,
                COALESCE(w.location_id::text, ib.location_id::text) AS scope_location_id
            FROM inventory_batches ib
            LEFT JOIN warehouses w ON ib.warehouse_id::text = w.id::text
            WHERE ib.id::text = $1::text
            LIMIT 1
        `,
        [batchId],
    );

    const batch = batchRes.rows[0];
    if (!batch) {
        return { success: false, error: 'Lote no encontrado' };
    }

    const locationId = String(batch.scope_location_id || '') || undefined;
    if (locationId) {
        const scope = resolveEffectiveInventoryLocation(actor, locationId);
        if (!scope.success) {
            return scope;
        }
    } else if (!hasGlobalInventoryScope(actor.role)) {
        return { success: false, error: 'El lote no tiene una ubicación válida para este actor' };
    }

    return {
        success: true,
        batch,
        locationId,
        warehouseId: String(batch.warehouse_id || '') || undefined,
    };
}

export async function ensureProductInInventoryScope(
    productId: string,
    actor: InventoryActor,
    executor?: Queryable,
): Promise<
    | { success: true; product: Record<string, unknown>; locationId?: string }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const productRes = await db.query(
        `
            SELECT
                p.*,
                NULLIF(TRIM(COALESCE(p.location_id::text, '')), '') AS direct_location_id
            FROM products p
            WHERE p.id::text = $1::text
            LIMIT 1
        `,
        [productId],
    );

    const product = productRes.rows[0];
    if (!product) {
        return { success: false, error: 'Producto no encontrado' };
    }

    let locationId = String(product.direct_location_id || '') || undefined;
    if (!locationId) {
        const batchScope = await db.query(
            `
                SELECT
                    COALESCE(w.location_id::text, ib.location_id::text) AS location_id
                FROM inventory_batches ib
                LEFT JOIN warehouses w ON ib.warehouse_id::text = w.id::text
                WHERE ib.product_id::text = $1::text
                ORDER BY ib.updated_at DESC NULLS LAST, ib.created_at DESC NULLS LAST, ib.id ASC
                LIMIT 1
            `,
            [productId],
        );

        locationId = String(batchScope.rows[0]?.location_id || '') || undefined;
    }

    if (locationId) {
        const scope = resolveEffectiveInventoryLocation(actor, locationId);
        if (!scope.success) {
            return scope;
        }
    } else if (!hasGlobalInventoryScope(actor.role)) {
        return { success: false, error: 'El producto no tiene una ubicación válida para este actor' };
    }

    return { success: true, product, locationId };
}
