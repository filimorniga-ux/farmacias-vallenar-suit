import 'server-only';

import {
    getActorOrFail,
    normalizeRole,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    type PinRbacActor,
} from '@/lib/pin-rbac';

export type CustomerActor = PinRbacActor;

// Customers are currently modeled as a global domain.
// Non-global actors may perform limited operational lookup/create flows,
// but the administrative directory, exports, history and destructive actions
// are restricted to global roles until the schema supports location ownership.
export const CUSTOMER_GLOBAL_ROLES = ROLE_GROUPS.ADMIN;
export const CUSTOMER_LOOKUP_ROLES = [
    'CASHIER',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;
export const CUSTOMER_CREATE_ROLES = CUSTOMER_LOOKUP_ROLES;
export const CUSTOMER_DIRECTORY_ROLES = CUSTOMER_GLOBAL_ROLES;
export const CUSTOMER_WRITE_ROLES = CUSTOMER_GLOBAL_ROLES;
export const CUSTOMER_EXPORT_ROLES = CUSTOMER_GLOBAL_ROLES;

export async function requireCustomerActor(
    allowedRoles: readonly string[],
    action = 'customer-operation',
): Promise<{ success: true; actor: CustomerActor } | { success: false; error: string }> {
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

export function hasGlobalCustomerScope(role: string) {
    return CUSTOMER_GLOBAL_ROLES.includes(
        normalizeRole(role) as typeof CUSTOMER_GLOBAL_ROLES[number],
    );
}

export function canUseGlobalCustomerDirectory(actor: CustomerActor) {
    return hasGlobalCustomerScope(actor.role);
}
