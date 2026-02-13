
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { TigerDataService } from '../../domain/services/TigerDataService';
import { InventoryBatch } from '../../domain/types';

export interface InventoryFilters {
    search?: string;
    category?: 'ALL' | 'MEDS' | 'RETAIL' | 'DETAIL' | 'CONTROLLED';
    stockStatus?: 'CRITICAL' | 'EXPIRING' | 'NORMAL' | 'ALL';
    incomplete?: boolean;
}

export interface InventoryPagination {
    // page: number; // Removed: Managed internally by infinite query
    limit: number;
}

export interface InventoryPagedResponse {
    data: InventoryBatch[];
    meta: {
        total: number;
        page: number;
        totalPages: number;
    };
}

export const useInventoryPagedQuery = (
    locationId: string | undefined,
    pagination: { limit: number },
    filters: InventoryFilters
) => {
    const queryClient = useQueryClient();
    const emptyResponse: InventoryPagedResponse = {
        data: [],
        meta: { total: 0, page: 1, totalPages: 1 }
    };

    const query = useInfiniteQuery<InventoryPagedResponse, Error>({
        queryKey: ['inventory', 'infinite', locationId, pagination.limit, filters],
        initialPageParam: 1,
        placeholderData: keepPreviousData,
        queryFn: async ({ pageParam = 1 }): Promise<InventoryPagedResponse> => {
            if (!locationId) return emptyResponse;

            console.log('📦 Fetching Infinite Page:', { page: pageParam, locationId, ...filters });
            return await TigerDataService.fetchInventoryPaged(locationId, {
                page: pageParam as number,
                limit: pagination.limit,
                ...filters
            });
        },
        getNextPageParam: (lastPage) => {
            const { page, totalPages } = lastPage.meta || { page: 1, totalPages: 1 };
            return page < totalPages ? page + 1 : undefined;
        },
        enabled: !!locationId,
        staleTime: 1000 * 30, // 30 seconds stale time
    });

    const invalidateInventory = () => {
        if (locationId) {
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
    };

    return {
        ...query,
        invalidateInventory
    };
};
