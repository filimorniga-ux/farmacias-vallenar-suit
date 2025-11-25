import { NextResponse } from 'next/server';
import { receiveProduct } from '@/lib/data/supply';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { producto_id, numero_lote, fecha_vencimiento, cantidad, proveedor_id } = body;

        if (!producto_id || !numero_lote || !fecha_vencimiento || !cantidad) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        await receiveProduct({
            producto_id,
            numero_lote,
            fecha_vencimiento,
            cantidad,
            ubicacion_fisica: 'Bodega Central' // Default
        });

        // Optionally link to an order if we implemented full order management
        // For now just logging the reception linked to supplier
        console.log(`Received product ${producto_id} from supplier ${proveedor_id}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error receiving product:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
