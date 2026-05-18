import 'server-only';

import { normalizeRole } from '@/lib/pin-rbac';
import { getValidatedSession } from '@/lib/server-session';
import { resolveScopedLocation } from './scoped-location';

export const ADMIN_LAYOUT_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'] as const;
export const ANALYTICS_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const ANALYTICS_GLOBAL_ROLES = ['ADMIN', 'GERENTE_GENERAL'] as const;
export const PRICING_READ_ROLES = ['MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const PRICING_GLOBAL_ROLES = ['QF', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const PRICING_WRITE_ROLES = ['QF', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const AUDIT_VIEW_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const AUDIT_GLOBAL_ROLES = ['ADMIN', 'GERENTE_GENERAL'] as const;

export interface AdminScopedActor {
    userId: string;
    userName: string;
    role: string;
    locationId?: string;
    tokenVersion: number;
    sessionToken: string;
}

export async function requireScopedActor(
    allowedRoles: readonly string[],
): Promise<{ success: true; actor: AdminScopedActor } | { success: false; error: string }> {
    const session = await getValidatedSession();
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

export function hasGlobalScope(
    actorRole: string,
    globalRoles: readonly string[],
) {
    return globalRoles.map(normalizeRole).includes(normalizeRole(actorRole));
}

export function resolveEffectiveLocation(
    actor: AdminScopedActor,
    requestedLocationId?: string,
    globalRoles: readonly string[] = AUDIT_GLOBAL_ROLES,
): { success: true; locationId?: string } | { success: false; error: string } {
    return resolveScopedLocation(actor, requestedLocationId, (role) => hasGlobalScope(role, globalRoles));
}
