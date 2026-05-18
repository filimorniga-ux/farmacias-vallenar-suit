import type { EmployeeProfile, Location } from '@/domain/types';

export type WmsContextSource = 'store' | 'location-store' | 'assigned' | 'none';

interface ResolveWmsVisibleContextParams {
    currentLocationId?: string | null;
    currentWarehouseId?: string | null;
    user?: Pick<EmployeeProfile, 'assigned_location_id'> | null;
    locationStoreCurrent?: Location | null;
    locations?: Location[];
}

export interface WmsVisibleContext {
    locationId: string;
    warehouseId: string;
    location: Location | null;
    locationName: string;
    locationType: Location['type'] | 'STORE';
    source: WmsContextSource;
    shouldSyncStore: boolean;
}

export function resolveWmsVisibleContext(
    params: ResolveWmsVisibleContextParams,
): WmsVisibleContext {
    const {
        currentLocationId = '',
        currentWarehouseId = '',
        user,
        locationStoreCurrent = null,
        locations = [],
    } = params;
    const locationList = Array.isArray(locations) ? locations : [];

    const currentLocation = currentLocationId
        ? locationList.find((location) => location.id === currentLocationId) || null
        : null;
    const assignedLocation = user?.assigned_location_id
        ? locationList.find((location) => location.id === user.assigned_location_id) || null
        : null;

    let source: WmsContextSource = 'none';
    let location: Location | null =
        currentLocation
        || (locationStoreCurrent?.id === currentLocationId ? locationStoreCurrent : null);

    if (location) {
        source = 'store';
    }

    if (!location && locationStoreCurrent) {
        source = 'location-store';
        location = locationStoreCurrent;
    }

    if (!location && assignedLocation) {
        source = 'assigned';
        location = assignedLocation;
    }

    const locationId = location?.id || currentLocationId || '';
    const warehouseId = currentWarehouseId
        || location?.default_warehouse_id
        || (location?.type === 'WAREHOUSE' ? location.id : '');
    const shouldSyncStore = Boolean(
        location?.id && (
            currentLocationId !== location.id
            || (warehouseId && currentWarehouseId !== warehouseId)
        ),
    );

    return {
        locationId,
        warehouseId,
        location,
        locationName: location?.name || 'Sin ubicación',
        locationType: location?.type || 'STORE',
        source,
        shouldSyncStore,
    };
}
