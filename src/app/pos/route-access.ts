import { redirect } from 'next/navigation';

import { getValidatedSession } from '@/lib/server-session';

export const POS_ROUTE_ROLES = ['ADMIN', 'QF', 'CASHIER', 'MANAGER', 'GERENTE_GENERAL'] as const;

export async function requirePosRouteAccess() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const role = String(session.role || '').trim().toUpperCase();
    if (!POS_ROUTE_ROLES.includes(role as typeof POS_ROUTE_ROLES[number])) {
        redirect('/');
    }

    return session;
}
