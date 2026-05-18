import 'server-only';

import { query } from '@/lib/db';

type Queryable = {
    query: (sql: string, params?: Array<string | number | boolean | Date | string[] | null | undefined>) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

type ScopedActorLike = {
    role: string;
    locationId?: string | null;
};

function asQueryable(executor?: Queryable) {
    return executor ?? { query };
}

export function resolveScopedLocation(
    actor: ScopedActorLike,
    requestedLocationId: string | null | undefined,
    hasGlobalScope: (role: string) => boolean,
): { success: true; locationId?: string } | { success: false; error: string } {
    if (hasGlobalScope(actor.role)) {
        return { success: true, locationId: requestedLocationId || undefined };
    }

    if (!actor.locationId) {
        return { success: false, error: 'No tienes una ubicación asignada' };
    }

    if (requestedLocationId && requestedLocationId !== actor.locationId) {
        return { success: false, error: 'Acceso denegado a otra ubicación' };
    }

    return { success: true, locationId: actor.locationId };
}

export async function getWarehouseLocationId(
    warehouseId: string,
    executor?: Queryable,
): Promise<string | undefined> {
    const db = asQueryable(executor);
    const warehouseRes = await db.query(
        'SELECT location_id::text AS location_id FROM warehouses WHERE id::text = $1::text LIMIT 1',
        [warehouseId],
    );

    return String(warehouseRes.rows[0]?.location_id || '') || undefined;
}

export async function ensureWarehouseBelongsToLocation(
    warehouseId: string,
    locationId: string,
    executor?: Queryable,
): Promise<boolean> {
    const warehouseLocationId = await getWarehouseLocationId(warehouseId, executor);
    return warehouseLocationId === locationId;
}
