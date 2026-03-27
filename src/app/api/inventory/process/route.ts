
import { NextResponse } from 'next/server';
import { processImportBatch } from '@/services/inventory-matcher';
import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

function parseBatchSize(value: unknown) {
    const parsed = Number(value ?? 20);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        return null;
    }

    return parsed;
}

export async function POST(req: Request) {
    try {
        const auth = await requireApiRoles(OPERATIONS_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        const body = await req.json().catch(() => ({}));
        const batchSize = parseBatchSize(body.batchSize);
        if (batchSize === null) {
            return NextResponse.json(
                { success: false, error: 'Invalid batchSize', code: 'INVALID_BATCH_SIZE' },
                { status: 400 }
            );
        }

        // Execute batch process
        const result = await processImportBatch(batchSize);

        logger.info(
            {
                actorUserId: auth.session.userId,
                actorRole: auth.session.role,
                batchSize,
                processed: result.processed,
            },
            '[InventoryProcessRoute] Batch processed'
        );

        return NextResponse.json({
            success: true,
            processed: result.processed,
            message: result.message || "Batch processed successfully"
        });

    } catch (error: any) {
        logger.error({ error }, '[InventoryProcessRoute] Processing failed');
        return NextResponse.json(
            { success: false, error: 'No fue posible procesar el lote de inventario', code: 'INVENTORY_PROCESS_FAILED' },
            { status: 500 }
        );
    }
}
