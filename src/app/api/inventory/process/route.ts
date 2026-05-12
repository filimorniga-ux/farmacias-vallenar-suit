import { NextResponse } from 'next/server';

import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';

export async function POST(_req: Request) {
    try {
        const auth = await requireApiRoles(OPERATIONS_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Procesamiento legacy de inventario deshabilitado. Use flujos canónicos de importación y diagnóstico.',
                code: 'INVENTORY_PROCESS_LEGACY_DISABLED',
            },
            { status: 410, headers: API_NO_STORE_HEADERS },
        );
    } catch {
        return NextResponse.json(
            {
                success: false,
                error: 'No fue posible validar el endpoint legacy de inventario',
                code: 'INVENTORY_PROCESS_LEGACY_FAILED',
            },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    }
}
