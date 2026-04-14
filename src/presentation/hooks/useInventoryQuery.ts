
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TigerDataService } from '../../domain/services/TigerDataService';
import { inventoryQueryKeys } from '@/presentation/lib/inventory-query-keys';

type InventoryQueryMode = 'full' | 'wms-lite';

interface UseInventoryQueryOptions {
    mode?: InventoryQueryMode;
    enabled?: boolean;
}

export const inventoryQueryKey = (
    locationId?: string,
    mode: InventoryQueryMode = 'full'
) => inventoryQueryKeys.byMode(locationId, mode);

export const useInventoryQuery = (
    locationId?: string,
    options: UseInventoryQueryOptions = {}
) => {
    const queryClient = useQueryClient();
    const mode = options.mode || 'full';
    const enabled = options.enabled ?? !!locationId;
    const staleTime = mode === 'wms-lite' ? 1000 * 60 * 5 : 1000 * 30;

    const query = useQuery({
        queryKey: inventoryQueryKey(locationId, mode),
        queryFn: async () => {
            if (!locationId) return [];
            console.log(`📦 Fetching Inventory (${mode}) for:`, locationId);
            return mode === 'wms-lite'
                ? await TigerDataService.fetchInventoryWMS(locationId)
                : await TigerDataService.fetchInventory(locationId);
        },
        enabled,
        staleTime,
        gcTime: 1000 * 60 * 60 * 24, // 24 horas de persistencia en disco
        refetchOnWindowFocus: false,
        placeholderData: (previousData) => previousData,
    });

    const invalidateInventory = () => {
        if (locationId) {
            queryClient.invalidateQueries({ queryKey: inventoryQueryKey(locationId, mode) });
        }
    };

    return {
        ...query,
        invalidateInventory
    };
};
