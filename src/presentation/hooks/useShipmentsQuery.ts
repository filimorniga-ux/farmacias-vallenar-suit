import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shipment } from '@/domain/types';
import { TigerDataService } from '../../domain/services/TigerDataService';

interface UseShipmentsQueryOptions {
    enabled?: boolean;
}

export const shipmentsQueryKey = (locationId?: string) =>
    ['shipments', locationId ?? null] as const;

export const shipmentsQueryOptions = (locationId?: string) => queryOptions<Shipment[]>({
    queryKey: shipmentsQueryKey(locationId),
    queryFn: async () => TigerDataService.fetchShipments(locationId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
});

export const useShipmentsQuery = (
    locationId?: string,
    options: UseShipmentsQueryOptions = {}
) => {
    const queryClient = useQueryClient();
    const enabled = options.enabled ?? true;

    const query = useQuery({
        ...shipmentsQueryOptions(locationId),
        enabled,
        refetchOnWindowFocus: false,
        placeholderData: (previousData) => previousData,
    });

    const invalidateShipments = () => {
        return queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(locationId) });
    };

    return {
        ...query,
        invalidateShipments,
    };
};
