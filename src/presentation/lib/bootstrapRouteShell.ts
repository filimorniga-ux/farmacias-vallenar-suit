import type { EmployeeProfile, Location } from '@/domain/types';
import { fetchEmployeesSecure, fetchLocationsSecure } from '@/actions/sync-v2';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';

type BootstrapProfile = {
    prefetchTerminals: boolean;
};

function resolveBootstrapProfile(targetPath: string): BootstrapProfile {
    const normalizedPath = targetPath || '/dashboard';

    return {
        prefetchTerminals:
            normalizedPath.startsWith('/pos') ||
            normalizedPath.startsWith('/warehouse') ||
            normalizedPath.startsWith('/logistica'),
    };
}

async function loadEmployeesSeed(): Promise<EmployeeProfile[]> {
    if (!usePharmaStore.getState().user?.id && !usePharmaStore.getState().user?.assigned_location_id) {
        return usePharmaStore.getState().employees;
    }

    try {
        const result = await fetchEmployeesSecure();
        if (result.success) {
            return (result.data || []) as unknown as EmployeeProfile[];
        }
    } catch {
        // Best-effort bootstrap: keep current in-memory employees on failure.
    }

    return usePharmaStore.getState().employees;
}

async function loadLocationsSeed(): Promise<Location[]> {
    if (!usePharmaStore.getState().user?.id && !usePharmaStore.getState().user?.assigned_location_id) {
        return useLocationStore.getState().locations;
    }

    try {
        const result = await fetchLocationsSecure();
        if (result.success) {
            return (result.data || []) as Location[];
        }
    } catch {
        // Best-effort bootstrap: keep current in-memory locations on failure.
    }

    return useLocationStore.getState().locations;
}

function syncLocationContext(locations: Location[]): string | undefined {
    const pharmaState = usePharmaStore.getState();
    const locationState = useLocationStore.getState();
    const preferredLocationId =
        pharmaState.currentLocationId ||
        locationState.currentLocation?.id ||
        pharmaState.user?.assigned_location_id ||
        '';

    if (!preferredLocationId) {
        return undefined;
    }

    const targetLocation = locations.find((location) => location.id === preferredLocationId);
    if (!targetLocation) {
        return undefined;
    }

    if (locationState.currentLocation?.id !== targetLocation.id) {
        locationState.switchLocation(targetLocation.id);
    }

    if (pharmaState.currentLocationId !== targetLocation.id) {
        usePharmaStore.setState({
            currentLocationId: targetLocation.id,
            currentWarehouseId: pharmaState.currentWarehouseId || targetLocation.default_warehouse_id || '',
            currentTerminalId: pharmaState.currentTerminalId,
        });
    } else if (!pharmaState.currentWarehouseId && targetLocation.default_warehouse_id) {
        usePharmaStore.setState({
            currentWarehouseId: targetLocation.default_warehouse_id,
        });
    }

    return targetLocation.id;
}

export async function bootstrapRouteShell(targetPath: string): Promise<void> {
    const profile = resolveBootstrapProfile(targetPath);

    const [employees, locations] = await Promise.all([
        loadEmployeesSeed(),
        loadLocationsSeed(),
    ]);

    if (employees.length > 0) {
        usePharmaStore.setState({ employees });
    }

    if (locations.length > 0) {
        useLocationStore.getState().setLocations(locations);
    }

    const effectiveLocationId = locations.length > 0 ? syncLocationContext(locations) : usePharmaStore.getState().currentLocationId || undefined;

    if (profile.prefetchTerminals && effectiveLocationId) {
        try {
            await usePharmaStore.getState().fetchTerminals(effectiveLocationId);
        } catch {
            // Best-effort bootstrap: terminales no críticos no deben ensuciar el shell.
        }
    }
}
