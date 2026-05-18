import type { InventoryFilters } from '@/presentation/hooks/useInventoryPagedQuery';

export type InventoryQueryMode = 'full' | 'wms-lite';

export const inventoryQueryKeys = {
    root: ['inventory'] as const,
    byMode: (locationId?: string, mode: InventoryQueryMode = 'full') =>
        ['inventory', locationId, mode] as const,
    infinite: (
        locationId: string | undefined,
        limit: number,
        filters: InventoryFilters,
    ) => ['inventory', 'infinite', locationId, limit, filters] as const,
};
