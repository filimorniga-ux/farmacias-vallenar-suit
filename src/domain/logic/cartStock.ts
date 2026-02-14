import { CartItem, InventoryBatch } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeId = (value?: string): string => String(value || '').trim();

export const isUuid = (value?: string): boolean => UUID_REGEX.test(normalizeId(value));

/**
 * Resuelve IDs de lote para carrito y venta:
 * - batchId: siempre debe apuntar al lote que se vende realmente.
 * - originalBatchId: solo aplica para lotes al detal como referencia del lote de caja origen.
 */
export function resolveCartBatchIds(
    item: Pick<InventoryBatch, 'id' | 'is_retail_lot' | 'original_batch_id'>
): { batchId: string; originalBatchId?: string } {
    const itemId = normalizeId(item.id);
    const sourceBatchId = normalizeId(item.original_batch_id);

    const batchId = isUuid(itemId)
        ? itemId
        : (isUuid(sourceBatchId) ? sourceBatchId : (itemId || sourceBatchId));

    const originalBatchId = item.is_retail_lot && isUuid(sourceBatchId) && sourceBatchId !== batchId
        ? sourceBatchId
        : undefined;

    return {
        batchId,
        originalBatchId
    };
}

export function buildSoldQuantityByBatch(
    cart: Array<Pick<CartItem, 'batch_id' | 'quantity'>>
): Map<string, number> {
    const soldByBatch = new Map<string, number>();

    for (const item of cart) {
        const batchId = normalizeId(item.batch_id);
        if (!batchId) continue;

        const upperBatchId = batchId.toUpperCase();
        if (upperBatchId === 'MANUAL' || upperBatchId.startsWith('MANUAL')) continue;

        const current = soldByBatch.get(batchId) || 0;
        soldByBatch.set(batchId, current + Number(item.quantity || 0));
    }

    return soldByBatch;
}
