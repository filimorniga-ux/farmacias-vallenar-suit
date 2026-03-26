import { NextResponse } from 'next/server';
import { getValidatedSession } from '@/lib/server-session';

export const OPERATIONS_API_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;
export const INVENTORY_API_ROLES = ['WAREHOUSE', 'QF', ...OPERATIONS_API_ROLES] as const;

type AuthorizedApiResult =
    | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getValidatedSession>>> }
    | { ok: false; response: NextResponse };

export async function requireApiRoles(allowedRoles: readonly string[]): Promise<AuthorizedApiResult> {
    const session = await getValidatedSession();

    if (!session) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'No autorizado', code: 'AUTH_UNAUTHORIZED' },
                { status: 401 }
            ),
        };
    }

    if (!allowedRoles.includes(session.role)) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: 'Acceso denegado', code: 'AUTH_FORBIDDEN' },
                { status: 403 }
            ),
        };
    }

    return { ok: true, session };
}
