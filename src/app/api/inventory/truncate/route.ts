import { NextResponse } from 'next/server';

import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';

export async function POST(_request: Request) {
    try {
        const auth = await requireApiRoles(OPERATIONS_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        return NextResponse.json(
            {
                error: 'Endpoint legacy deshabilitado. Use /api/inventory/maintenance con action TRUNCATE.',
                code: 'INVENTORY_TRUNCATE_LEGACY_DISABLED',
            },
            { status: 410, headers: API_NO_STORE_HEADERS },
        );
    } catch (error) {
        return NextResponse.json(
            { error: 'Error al validar mantenimiento de inventario', code: 'INVENTORY_TRUNCATE_LEGACY_FAILED' },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    }
}
