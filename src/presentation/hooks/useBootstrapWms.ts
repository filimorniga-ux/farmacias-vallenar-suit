import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { purchaseOrdersQueryOptions } from '@/presentation/hooks/usePurchaseOrdersQuery';
import { shipmentsQueryOptions } from '@/presentation/hooks/useShipmentsQuery';

interface UseBootstrapWmsOptions {
    activeLocationId?: string | null;
    auto?: boolean;
}

interface BootstrapWmsOptions {
    force?: boolean;
}

export function useBootstrapWms({ activeLocationId, auto = true }: UseBootstrapWmsOptions) {
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
                force
                    ? queryClient.fetchQuery({
                        ...purchaseOrdersQueryOptions(activeLocationId),
                        staleTime: 0,
                    })
                    : queryClient.ensureQueryData(purchaseOrdersQueryOptions(activeLocationId)),
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
    }, [activeLocationId, queryClient]);

    useEffect(() => {
        if (!auto) return;
        void bootstrapWms();
    }, [auto, bootstrapWms]);

    return {
        bootstrapWms,
        error,
        isBootstrappingWms,
    };
}
