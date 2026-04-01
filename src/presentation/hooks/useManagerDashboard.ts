import { useQuery } from '@tanstack/react-query';
import {
    getManagerRealTimeDataSecure,
    type ManagerDashboardData,
} from '@/actions/manager-dashboard-v2';

const MANAGER_DASHBOARD_STALE_TIME = 1000 * 60;
const MANAGER_DASHBOARD_REFRESH_INTERVAL = 1000 * 60;

type UseManagerDashboardOptions = {
    initialData?: ManagerDashboardData | null;
    selectedBranchId?: string | null;
};

export const managerDashboardQueryKey = (branchId?: string | null) =>
    ['manager-dashboard', branchId ?? null] as const;

async function fetchManagerDashboard(selectedBranchId?: string | null) {
    const result = await getManagerRealTimeDataSecure(selectedBranchId ?? undefined);

    if (!result.success || !result.data) {
        throw new Error(result.error || 'Error al cargar tablero gerencial');
    }

    return result.data;
}

export function useManagerDashboard({
    initialData,
    selectedBranchId,
}: UseManagerDashboardOptions = {}) {
    const initialBranchId = initialData?.selectedBranch?.locationId ?? null;
    const activeBranchId = selectedBranchId ?? initialBranchId;
    const shouldHydrateFromInitialData = activeBranchId === initialBranchId && !!initialData;

    return useQuery({
        queryKey: managerDashboardQueryKey(activeBranchId),
        queryFn: () => fetchManagerDashboard(activeBranchId),
        initialData: shouldHydrateFromInitialData ? initialData ?? undefined : undefined,
        initialDataUpdatedAt: shouldHydrateFromInitialData ? Date.now() : undefined,
        staleTime: MANAGER_DASHBOARD_STALE_TIME,
        refetchOnMount: shouldHydrateFromInitialData ? false : true,
        refetchOnWindowFocus: false,
        refetchInterval: MANAGER_DASHBOARD_REFRESH_INTERVAL,
        refetchIntervalInBackground: false,
        placeholderData: (previousData) => previousData,
    });
}
