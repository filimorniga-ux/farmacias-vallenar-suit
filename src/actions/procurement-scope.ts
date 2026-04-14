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

export type ProcurementActor = PinRbacActor;

export const PROCUREMENT_GLOBAL_ROLES = ROLE_GROUPS.ADMIN;
export const PROCUREMENT_READ_ROLES = [
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;
export const PROCUREMENT_WRITE_ROLES = PROCUREMENT_READ_ROLES;
export const PROCUREMENT_APPROVER_ROLES = ROLE_GROUPS.MANAGER;
export const SUPPLIER_CATALOG_ROLES = [
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;

function asQueryable(executor?: Queryable) {
    return executor ?? { query };
}

export function hasGlobalProcurementScope(role: string) {
    return PROCUREMENT_GLOBAL_ROLES.includes(
        normalizeRole(role) as typeof PROCUREMENT_GLOBAL_ROLES[number],
    );
}

export async function requireProcurementActor(
    allowedRoles: readonly string[],
    action = 'procurement-operation',
): Promise<{ success: true; actor: ProcurementActor } | { success: false; error: string }> {
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

export function resolveEffectiveProcurementLocation(
    actor: ProcurementActor,
    requestedLocationId?: string | null,
): { success: true; locationId?: string } | { success: false; error: string } {
    return resolveScopedLocation(actor, requestedLocationId, hasGlobalProcurementScope);
}

export async function ensureWarehouseInProcurementScope(
    warehouseId: string,
    actor: ProcurementActor,
    executor?: Queryable,
): Promise<{ success: true; locationId: string } | { success: false; error: string }> {
    const locationId = await getWarehouseLocationId(warehouseId, asQueryable(executor));
    if (!locationId) {
        return { success: false, error: 'Bodega no encontrada' };
    }

    const scope = resolveEffectiveProcurementLocation(actor, locationId);
    if (!scope.success) {
        return scope;
    }

    return { success: true, locationId };
}

export async function resolveWarehouseForActor(
    actor: ProcurementActor,
    requestedWarehouseId?: string | null,
    executor?: Queryable,
): Promise<{ success: true; warehouseId: string; locationId?: string } | { success: false; error: string }> {
    const db = asQueryable(executor);

    if (requestedWarehouseId) {
        const scope = await ensureWarehouseInProcurementScope(requestedWarehouseId, actor, db);
        if (!scope.success) {
            return scope;
        }

        return {
            success: true,
            warehouseId: requestedWarehouseId,
            locationId: scope.locationId,
        };
    }

    if (!hasGlobalProcurementScope(actor.role)) {
        const scoped = resolveEffectiveProcurementLocation(actor);
        if (!scoped.success || !scoped.locationId) {
            return { success: false, error: scoped.success ? 'No se pudo resolver ubicación' : scoped.error };
        }

        const locationRes = await db.query(
            `
                SELECT COALESCE(default_warehouse_id::text, '') AS default_warehouse_id
                FROM locations
                WHERE id::text = $1::text
                LIMIT 1
            `,
            [scoped.locationId],
        );

        const defaultWarehouseId = String(locationRes.rows[0]?.default_warehouse_id || '');
        if (defaultWarehouseId) {
            return {
                success: true,
                warehouseId: defaultWarehouseId,
                locationId: scoped.locationId,
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
            [scoped.locationId],
        );

        const warehouseId = String(warehouseRes.rows[0]?.id || '');
        if (!warehouseId) {
            return { success: false, error: 'No se encontró bodega para la ubicación del actor' };
        }

        return {
            success: true,
            warehouseId,
            locationId: scoped.locationId,
        };
    }

    const globalWarehouseRes = await db.query(
        'SELECT id::text AS id, location_id::text AS location_id FROM warehouses ORDER BY id ASC LIMIT 1',
    );
    const warehouseId = String(globalWarehouseRes.rows[0]?.id || '');
    if (!warehouseId) {
        return { success: false, error: 'No hay bodegas configuradas' };
    }

    return {
        success: true,
        warehouseId,
        locationId: String(globalWarehouseRes.rows[0]?.location_id || '') || undefined,
    };
}

export async function ensurePurchaseOrderInProcurementScope(
    orderId: string,
    actor: ProcurementActor,
    executor?: Queryable,
): Promise<
    | { success: true; order: Record<string, unknown>; locationId?: string }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const orderRes = await db.query(
        `
            SELECT
                po.*,
                w.location_id::text AS location_id
            FROM purchase_orders po
            LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
            WHERE po.id::text = $1::text
            LIMIT 1
        `,
        [orderId],
    );

    const order = orderRes.rows[0];
    if (!order) {
        return { success: false, error: 'Orden no encontrada' };
    }

    const locationId = String(order.location_id || '') || undefined;
    if (locationId) {
        const scope = resolveEffectiveProcurementLocation(actor, locationId);
        if (!scope.success) {
            return scope;
        }
    } else if (!hasGlobalProcurementScope(actor.role)) {
        return { success: false, error: 'La orden no tiene ubicación válida para este actor' };
    }

    return { success: true, order, locationId };
}

export async function ensureShipmentInProcurementScope(
    shipmentId: string,
    actor: ProcurementActor,
    executor?: Queryable,
): Promise<
    | { success: true; shipment: Record<string, unknown> }
    | { success: false; error: string }
> {
    const db = asQueryable(executor);
    const shipmentRes = await db.query(
        `
            SELECT
                id,
                origin_location_id::text AS origin_location_id,
                destination_location_id::text AS destination_location_id
            FROM shipments
            WHERE id::text = $1::text
            LIMIT 1
        `,
        [shipmentId],
    );

    const shipment = shipmentRes.rows[0];
    if (!shipment) {
        return { success: false, error: 'Envío no encontrado' };
    }

    if (!hasGlobalProcurementScope(actor.role)) {
        if (!actor.locationId) {
            return { success: false, error: 'No tienes una ubicación asignada' };
        }

        const origin = String(shipment.origin_location_id || '');
        const destination = String(shipment.destination_location_id || '');
        const belongsToActor = origin === actor.locationId || destination === actor.locationId;
        if (!belongsToActor) {
            return { success: false, error: 'Acceso denegado a otra ubicación' };
        }
    }

    return { success: true, shipment };
}

export async function ensureTransferReferenceInProcurementScope(
    transferId: string,
    actor: ProcurementActor,
    executor?: Queryable,
): Promise<{ success: true } | { success: false; error: string }> {
    if (hasGlobalProcurementScope(actor.role)) {
        return { success: true };
    }

    if (!actor.locationId) {
        return { success: false, error: 'No tienes una ubicación asignada' };
    }

    const db = asQueryable(executor);
    const res = await db.query(
        `
            SELECT DISTINCT location_id::text AS location_id
            FROM stock_movements
            WHERE reference_id::text = $1::text
              AND reference_type = 'LOCATION_TRANSFER'
              AND movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN')
        `,
        [transferId],
    );

    const locationIds = res.rows
        .map((row) => String(row.location_id || ''))
        .filter(Boolean);

    if (locationIds.length === 0) {
        return { success: false, error: 'Traspaso no encontrado' };
    }

    if (!locationIds.includes(actor.locationId)) {
        return { success: false, error: 'Acceso denegado a otra ubicación' };
    }

    return { success: true };
}
