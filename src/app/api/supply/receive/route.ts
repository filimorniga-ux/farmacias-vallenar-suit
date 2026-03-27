import { NextResponse } from 'next/server';
import { receiveProduct } from '@/lib/data/supply';
import { INVENTORY_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const auth = await requireApiRoles(INVENTORY_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        const body = await request.json();
        const { producto_id, numero_lote, fecha_vencimiento, cantidad, proveedor_id } = body;

        if (
            !producto_id
            || !numero_lote
            || !fecha_vencimiento
            || cantidad === undefined
            || cantidad === null
            || cantidad === ''
        ) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        const parsedCantidad = Number(cantidad);
        if (!Number.isFinite(parsedCantidad) || parsedCantidad <= 0) {
            return NextResponse.json({ error: 'Invalid cantidad', code: 'INVALID_CANTIDAD' }, { status: 400 });
        }

        await receiveProduct({
            producto_id,
            numero_lote,
            fecha_vencimiento,
            cantidad: parsedCantidad,
            ubicacion_fisica: 'Bodega Central' // Default
        });

        logger.info(
            {
                actorUserId: auth.session.userId,
                actorRole: auth.session.role,
                productoId: producto_id,
                proveedorId: proveedor_id ?? null,
                cantidad: parsedCantidad,
            },
            '[SupplyReceiveRoute] Product received'
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        logger.error({ error }, '[SupplyReceiveRoute] Receive failed');
        return NextResponse.json(
            { error: 'No fue posible registrar la recepción del producto', code: 'SUPPLY_RECEIVE_FAILED' },
            { status: 500 }
        );
    }
}
