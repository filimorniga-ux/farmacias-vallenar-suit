import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePharmaStore } from '@/presentation/store/useStore';
import { shipmentsQueryOptions } from '@/presentation/hooks/useShipmentsQuery';

interface UseBootstrapWmsOptions {
    activeLocationId?: string | null;
}

interface BootstrapWmsOptions {
    force?: boolean;
}

export function useBootstrapWms({ activeLocationId }: UseBootstrapWmsOptions) {
    const refreshPurchaseOrders = usePharmaStore((state) => state.refreshPurchaseOrders);
    const queryClient = useQueryClient();
    const bootstrappedLocationRef = useRef<string | null>(null);
    const inFlightLocationRef = useRef<string | null>(null);
    const [isBootstrappingWms, setIsBootstrappingWms] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const bootstrapWms = useCallback(async (options: BootstrapWmsOptions = {}) => {
        const { force = false } = options;

        if (!activeLocationId) {
            return false;
        }

        if (inFlightLocationRef.current === activeLocationId) {
            return false;
        }

        if (!force && bootstrappedLocationRef.current === activeLocationId) {
            return false;
        }

        inFlightLocationRef.current = activeLocationId;
        setIsBootstrappingWms(true);
        setError(null);

        try {
            await Promise.all([
                force
                    ? queryClient.fetchQuery({
                        ...shipmentsQueryOptions(activeLocationId),
                        staleTime: 0,
                    })
                    : queryClient.ensureQueryData(shipmentsQueryOptions(activeLocationId)),
                refreshPurchaseOrders(activeLocationId),
            ]);
            bootstrappedLocationRef.current = activeLocationId;
            return true;
        } catch (rawError) {
            const message = rawError instanceof Error ? rawError.message : 'No se pudo preparar WMS';
            setError(message);
            toast.error(message);
            Sentry.captureException(rawError, {
                tags: {
                    module: 'WMS',
                    action: 'bootstrap',
                },
                extra: {
                    activeLocationId,
                    force,
                },
            });
            return false;
        } finally {
            if (inFlightLocationRef.current === activeLocationId) {
                inFlightLocationRef.current = null;
            }
            setIsBootstrappingWms(false);
        }
    }, [activeLocationId, queryClient, refreshPurchaseOrders]);

    useEffect(() => {
        void bootstrapWms();
    }, [bootstrapWms]);

    return {
        bootstrapWms,
        error,
        isBootstrappingWms,
    };
}
