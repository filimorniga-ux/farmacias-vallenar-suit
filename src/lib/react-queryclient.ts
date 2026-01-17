import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// Opciones globales para optimización de caché
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Los datos se consideran "frescos" por 5 minutos
            staleTime: 1000 * 60 * 5,

            // Reintentar 1 vez en caso de fallo
            retry: 1,

            // Mantener datos inactivos en caché por 24 horas para persistencia efectiva
            gcTime: 1000 * 60 * 60 * 24,

            // No refetchear al cambiar de foco (a menos que se necesite realtime estricto)
            refetchOnWindowFocus: false,
        },
    },
});

export const localStoragePersister = typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage })
    : undefined;
