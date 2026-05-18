import { NextResponse } from 'next/server';

import { INVENTORY_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
import { logger } from '@/lib/logger';

const LEGACY_RECEIVE_DISABLED_RESPONSE = {
    error: 'Recepción legacy deshabilitada. Use el flujo WMS/abastecimiento vigente.',
    code: 'SUPPLY_RECEIVE_LEGACY_DISABLED',
} as const;

export async function POST(_request: Request) {
    try {
        const auth = await requireApiRoles(INVENTORY_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        logger.warn(
            {
                actorUserId: auth.session.userId,
                actorRole: auth.session.role,
            },
            '[SupplyReceiveRoute] Legacy endpoint disabled',
        );

        return NextResponse.json(
            LEGACY_RECEIVE_DISABLED_RESPONSE,
            { status: 410, headers: API_NO_STORE_HEADERS },
        );
    } catch (error: unknown) {
        logger.error({ error }, '[SupplyReceiveRoute] Receive failed');
        return NextResponse.json(
            { error: 'No fue posible registrar la recepción del producto', code: 'SUPPLY_RECEIVE_FAILED' },
            { status: 500, headers: API_NO_STORE_HEADERS },
        );
    }
}
