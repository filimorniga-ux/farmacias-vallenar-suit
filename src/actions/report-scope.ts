import 'server-only';

import { query } from '@/lib/db';
import { normalizeRole } from '@/lib/pin-rbac';
import { getSessionSecure } from './auth-v2';
import {
    ensureWarehouseBelongsToLocation,
    resolveScopedLocation,
} from './scoped-location';

export const REPORT_GLOBAL_ROLES = ['ADMIN', 'GERENTE_GENERAL'] as const;
export const REPORTS_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF', 'CASHIER', 'CONTADOR', 'WAREHOUSE', 'RRHH'] as const;
export const PRODUCT_REPORT_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'] as const;
export const RECEIPT_REPORT_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const ATTENDANCE_FULL_REPORT_ROLES = ['MANAGER', 'RRHH', 'ADMIN', 'GERENTE_GENERAL'] as const;

export interface ReportActor {
    userId: string;
    role: string;
    locationId?: string;
    userName: string;
    tokenVersion: number;
    sessionToken: string;
}

export async function requireReportActor(
    allowedRoles: readonly string[],
): Promise<{ success: true; actor: ReportActor } | { success: false; error: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const role = normalizeRole(session.role);
    const normalizedAllowed = allowedRoles.map(normalizeRole);

    if (!normalizedAllowed.includes(role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    return {
        success: true,
        actor: {
            ...session,
            role,
        },
    };
}

export function hasGlobalReportScope(role: string) {
    return REPORT_GLOBAL_ROLES.includes(normalizeRole(role) as typeof REPORT_GLOBAL_ROLES[number]);
}

export function resolveEffectiveLocation(
    actor: ReportActor,
    requestedLocationId?: string,
): { success: true; locationId?: string } | { success: false; error: string } {
    return resolveScopedLocation(actor, requestedLocationId, hasGlobalReportScope);
}

export async function ensureTerminalInLocation(terminalId: string, locationId: string) {
    const res = await query(
        'SELECT 1 FROM terminals WHERE id::text = $1::text AND location_id::text = $2::text LIMIT 1',
        [terminalId, locationId],
    );

    return (res.rowCount ?? 0) > 0;
}

export async function ensureEmployeeInLocation(employeeId: string, locationId: string) {
    const res = await query(
        'SELECT 1 FROM users WHERE id::text = $1::text AND assigned_location_id::text = $2::text LIMIT 1',
        [employeeId, locationId],
    );

    return (res.rowCount ?? 0) > 0;
}

export async function ensureSaleInLocation(saleId: string, locationId: string) {
    const res = await query(
        'SELECT 1 FROM sales WHERE id::text = $1::text AND location_id::text = $2::text LIMIT 1',
        [saleId, locationId],
    );

    return (res.rowCount ?? 0) > 0;
}

export async function ensureWarehouseInLocation(warehouseId: string, locationId: string) {
    return ensureWarehouseBelongsToLocation(warehouseId, locationId, { query });
}

export async function getDefaultWarehouseForLocation(locationId: string) {
    const res = await query(
        'SELECT default_warehouse_id FROM locations WHERE id::text = $1::text LIMIT 1',
        [locationId],
    );

    return String(res.rows[0]?.default_warehouse_id || '') || undefined;
}

export async function resolveLocationFromWarehouseOrLocation(value: string) {
    const warehouseRes = await query(
        'SELECT location_id::text as location_id FROM warehouses WHERE id::text = $1::text LIMIT 1',
        [value],
    );

    if ((warehouseRes.rowCount ?? 0) > 0) {
        return String(warehouseRes.rows[0]?.location_id || '') || undefined;
    }

    const locationRes = await query(
        'SELECT id::text as id FROM locations WHERE id::text = $1::text LIMIT 1',
        [value],
    );

    if ((locationRes.rowCount ?? 0) > 0) {
        return String(locationRes.rows[0]?.id || '') || undefined;
    }

    return undefined;
}

export function maskRutForLimitedScope(rut?: string | null) {
    if (!rut) {
        return rut ?? undefined;
    }

    const normalized = String(rut).trim();
    if (normalized.length <= 4) {
        return '***';
    }

    const visibleTail = normalized.slice(-4);
    return `${'*'.repeat(Math.max(0, normalized.length - 4))}${visibleTail}`;
}
