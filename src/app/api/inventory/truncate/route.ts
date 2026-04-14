import { NextResponse } from 'next/server';

import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { getClient } from '@/lib/db';

async function resetAllProductsStock(
    client: Awaited<ReturnType<typeof getClient>>,
) {
    await client.query(
        `
            UPDATE products
            SET stock_total = 0,
                stock_actual = 0,
                updated_at = NOW()
        `,
    );
}

export async function POST(request: Request) {
    try {
        const auth = await requireApiRoles(OPERATIONS_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        const body = await request.json();

        if (body.confirmation !== 'BORRAR') {
            return NextResponse.json(
                { error: 'Confirmación inválida. Debe escribir BORRAR.' },
                { status: 400 },
            );
        }

        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM inventory_batches');
            await resetAllProductsStock(client);
            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                message: 'Inventario vaciado correctamente.',
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Truncate error:', error);
        return NextResponse.json(
            { error: 'Error al vaciar inventario' },
            { status: 500 },
        );
    }
}
