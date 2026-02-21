export const DEFAULT_WAREHOUSE_FALLBACK_ID = '98d9ccca-583d-4720-9993-4fd73347e834';

export function isValidUuid(value?: string): value is string {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function resolveManualOrderIds(params: {
    selectedSupplierId?: string;
    currentWarehouseId?: string;
    fallbackWarehouseId?: string;
}): { supplierId: string | null; warehouseId: string } {
    const fallbackWarehouseId = params.fallbackWarehouseId || DEFAULT_WAREHOUSE_FALLBACK_ID;
    const supplierId = params.selectedSupplierId && params.selectedSupplierId !== 'TRANSFER' && isValidUuid(params.selectedSupplierId)
        ? params.selectedSupplierId
        : null;
    const warehouseId = isValidUuid(params.currentWarehouseId)
        ? params.currentWarehouseId
        : fallbackWarehouseId;

    return { supplierId, warehouseId };
}

export function shouldSyncMasterCost(item: {
    productId?: string;
    cost_price: number;
    original_cost?: number;
}): item is { productId: string; cost_price: number; original_cost?: number } {
    return Boolean(
        item.productId &&
        isValidUuid(item.productId) &&
        item.cost_price >= 0 &&
        item.cost_price !== item.original_cost
    );
}
