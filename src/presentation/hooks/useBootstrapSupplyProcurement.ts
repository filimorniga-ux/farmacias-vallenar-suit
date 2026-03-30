import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSuppliersListSecure } from '@/actions/suppliers-v2';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { purchaseOrdersQueryOptions } from '@/presentation/hooks/usePurchaseOrdersQuery';
import { shipmentsQueryOptions } from '@/presentation/hooks/useShipmentsQuery';

interface UseBootstrapSupplyProcurementOptions {
    activeLocationId?: string | null;
    enableKanbanBootstrap?: boolean;
    loadSuppliers?: boolean;
    loadLocations?: boolean;
}

interface BootstrapSupplyProcurementOptions {
    force?: boolean;
}

interface SupplierOption {
    id: string;
    name: string;
    business_name?: string | null;
    fantasy_name?: string | null;
}

export function useBootstrapSupplyProcurement({
    activeLocationId,
    enableKanbanBootstrap = true,
    loadSuppliers = true,
    loadLocations = true,
}: UseBootstrapSupplyProcurementOptions) {
    const queryClient = useQueryClient();
    const locations = useLocationStore((state) => state.locations);
    const fetchLocations = useLocationStore((state) => state.fetchLocations);
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isBootstrappingSupplyProcurement, setIsBootstrappingSupplyProcurement] = useState(false);
    const bootstrappedKeyRef = useRef<string | null>(null);
    const inFlightKeyRef = useRef<string | null>(null);
    const suppliersLoadedRef = useRef(false);

    const bootstrapSupplyProcurement = useCallback(async (options: BootstrapSupplyProcurementOptions = {}) => {
        const { force = false } = options;
        const bootstrapKey = [
            activeLocationId || 'global',
            enableKanbanBootstrap ? 'kanban' : 'shell',
            loadSuppliers ? 'suppliers' : 'no-suppliers',
            loadLocations ? 'locations' : 'no-locations',
        ].join(':');

        if (inFlightKeyRef.current === bootstrapKey) {
            return false;
        }

        if (!force && bootstrappedKeyRef.current === bootstrapKey) {
            return false;
        }

        inFlightKeyRef.current = bootstrapKey;
        setIsBootstrappingSupplyProcurement(true);
        setError(null);

        try {
            if (loadLocations && locations.length === 0) {
                await fetchLocations();
            }

            if (loadSuppliers && (!suppliersLoadedRef.current || force)) {
                const suppliersResult = await getSuppliersListSecure();
                if (!suppliersResult.success || !suppliersResult.data) {
                    throw new Error(suppliersResult.error || 'No se pudieron cargar los proveedores');
                }

                setSuppliers(suppliersResult.data.map((supplier) => ({
                    id: supplier.id,
                    name: supplier.name,
                    business_name: supplier.business_name ?? null,
                    fantasy_name: supplier.fantasy_name ?? null,
                })));
                suppliersLoadedRef.current = true;
            }

            if (enableKanbanBootstrap && activeLocationId) {
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
            }

            bootstrappedKeyRef.current = bootstrapKey;
            return true;
        } catch (rawError) {
            const message = rawError instanceof Error ? rawError.message : 'No se pudo preparar abastecimiento';
            setError(message);
            toast.error(message);
            Sentry.captureException(rawError, {
                tags: {
                    module: 'SUPPLY_PROCUREMENT',
                    action: 'bootstrap',
                },
                extra: {
                    activeLocationId,
                    enableKanbanBootstrap,
                    loadSuppliers,
                    loadLocations,
                    force,
                },
            });
            return false;
        } finally {
            if (inFlightKeyRef.current === bootstrapKey) {
                inFlightKeyRef.current = null;
            }
            setIsBootstrappingSupplyProcurement(false);
        }
    }, [
        activeLocationId,
        enableKanbanBootstrap,
        fetchLocations,
        loadLocations,
        loadSuppliers,
        locations.length,
        queryClient,
    ]);

    useEffect(() => {
        void bootstrapSupplyProcurement();
    }, [bootstrapSupplyProcurement]);

    return {
        bootstrapSupplyProcurement,
        error,
        isBootstrappingSupplyProcurement,
        suppliers,
    };
}
