
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDashboardStats } from '../../actions/analytics/dashboard-stats';
import { useLocationStore } from '../store/useLocationStore';

export const useDashboardMetrics = () => {
    const { currentLocation } = useLocationStore();
    const queryClient = useQueryClient();

    const query = useQuery({
        // Clave única por sucursal para evitar flickering al cambiar
        queryKey: ['dashboardStats', currentLocation?.id || 'all'],

        // Fetcher function
        queryFn: async () => {
            console.log('🔄 Fetching dashboard stats...');
            return await getDashboardStats();
        },

        // Optimizaciones
        staleTime: 1000 * 60 * 2, // 2 minutos de frescura
        // placeholderData: keepPreviousData // Mantener datos anteriores mientras carga nuevos (transición suave)
    });

    // Función para "Boost Mode" (pre-fetch manual)
    const prefetchDashboard = () => {
        queryClient.prefetchQuery({
            queryKey: ['dashboardStats', currentLocation?.id || 'all'],
            queryFn: getDashboardStats,
            staleTime: 1000 * 30 // 30 segundos
        });
    };

    return {
        ...query,
        prefetchDashboard
    };
};
