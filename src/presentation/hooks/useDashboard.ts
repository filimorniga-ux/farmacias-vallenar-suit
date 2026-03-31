import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDashboardStats, type DashboardStats } from '../../actions/analytics/dashboard-stats';

type UseDashboardMetricsOptions = {
    initialData?: DashboardStats | null;
};

const DASHBOARD_STATS_QUERY_KEY = ['dashboardStats'] as const;

export const useDashboardMetrics = ({ initialData }: UseDashboardMetricsOptions = {}) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: DASHBOARD_STATS_QUERY_KEY,
        queryFn: async () => {
            return await getDashboardStats();
        },
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: initialData ? Date.now() : undefined,
        staleTime: 1000 * 60 * 2, // 2 minutos de frescura
        refetchOnMount: initialData ? false : true,
    });

    const prefetchDashboard = () => {
        queryClient.prefetchQuery({
            queryKey: DASHBOARD_STATS_QUERY_KEY,
            queryFn: getDashboardStats,
            staleTime: 1000 * 30 // 30 segundos
        });
    };

    return {
        ...query,
        prefetchDashboard
    };
};
