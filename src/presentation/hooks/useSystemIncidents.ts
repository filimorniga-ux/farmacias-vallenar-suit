import { useQuery } from '@tanstack/react-query';
import { getRecentSystemIncidentsSecure } from '@/actions/maintenance-v2';

export interface SystemIncident {
    id: string;
    terminal_name: string;
    location_id: string;
    cashier_name: string;
    closed_at: string;
    end_time: string;
    notes: string | null;
}

const SYSTEM_INCIDENTS_STALE_TIME_MS = 1000 * 60 * 5;

export const systemIncidentsQueryKey = ['system-incidents', 'dashboard-banner'] as const;

export function useSystemIncidents(enabled: boolean) {
    return useQuery({
        queryKey: systemIncidentsQueryKey,
        queryFn: async () => {
            const result = await getRecentSystemIncidentsSecure();

            if (!result.success) {
                throw new Error(result.error || 'Error obteniendo incidencias');
            }

            return (result.data ?? []).map((incident) => ({
                ...incident,
                cashier_name: incident.cashier_name ?? 'Sistema',
                end_time: incident.closed_at,
            })) as SystemIncident[];
        },
        enabled,
        staleTime: SYSTEM_INCIDENTS_STALE_TIME_MS,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: (previousData) => previousData,
    });
}
