import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchaseOrder } from '@/domain/types';
import { TigerDataService } from '../../domain/services/TigerDataService';

interface UsePurchaseOrdersQueryOptions {
    enabled?: boolean;
}

export const purchaseOrdersQueryKey = (locationId?: string) =>
    ['purchaseOrders', locationId ?? null] as const;

export const purchaseOrdersQueryOptions = (locationId?: string) => queryOptions<PurchaseOrder[]>({
    queryKey: purchaseOrdersQueryKey(locationId),
    queryFn: async () => TigerDataService.fetchPurchaseOrders(locationId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
});

export const usePurchaseOrdersQuery = (
    locationId?: string,
    options: UsePurchaseOrdersQueryOptions = {}
) => {
    const queryClient = useQueryClient();
    const enabled = options.enabled ?? true;

    const query = useQuery({
        ...purchaseOrdersQueryOptions(locationId),
        enabled,
        refetchOnWindowFocus: false,
        placeholderData: (previousData) => previousData,
    });

    const invalidatePurchaseOrders = () => {
        return queryClient.invalidateQueries({ queryKey: purchaseOrdersQueryKey(locationId) });
    };

    return {
        ...query,
        invalidatePurchaseOrders,
    };
};
