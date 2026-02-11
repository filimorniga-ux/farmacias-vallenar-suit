
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocationStore } from '../store/useLocationStore';
import { TigerDataService } from '../../domain/services/TigerDataService';

export const useInventoryQuery = (locationId?: string) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['inventory', locationId],
        queryFn: async () => {
            if (!locationId) return [];
            console.log('📦 Fetching Inventory for:', locationId);
            return await TigerDataService.fetchInventory(locationId);
        },
        enabled: !!locationId, // Sólo ejecutar si hay locationId
        staleTime: 1000 * 30, // 30 seconds de "frescura"
        gcTime: 1000 * 60 * 60 * 24, // 24 horas de persistencia en disco
        refetchOnWindowFocus: false,
    });

    const invalidateInventory = () => {
        if (locationId) {
            queryClient.invalidateQueries({ queryKey: ['inventory', locationId] });
        }
    };

    return {
        ...query,
        invalidateInventory
    };
};
