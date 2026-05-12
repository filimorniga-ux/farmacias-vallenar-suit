import type { EmployeeProfile, Location } from '@/domain/types';

export type ProcurementVisibleContextSource = 'requested' | 'store' | 'location-store' | 'assigned' | 'none';

interface ResolveProcurementVisibleContextParams {
    requestedLocationId?: string | null;
    requestedWarehouseId?: string | null;
    currentLocationId?: string | null;
    currentWarehouseId?: string | null;
    user?: Pick<EmployeeProfile, 'assigned_location_id'> | null;
    locationStoreCurrent?: Location | null;
    locations?: Location[];
}

export interface ProcurementVisibleContext {
    locationId: string;
    warehouseId: string;
    location: Location | null;
    locationName: string;
    source: ProcurementVisibleContextSource;
}

export function resolveProcurementVisibleContext(
    params: ResolveProcurementVisibleContextParams,
): ProcurementVisibleContext {
    const {
        requestedLocationId = '',
        requestedWarehouseId = '',
        currentLocationId = '',
        currentWarehouseId = '',
        user,
        locationStoreCurrent = null,
        locations = [],
    } = params;

    const locationList = Array.isArray(locations) ? locations : [];
    const requestedLocation = requestedLocationId
        ? locationList.find((location) => location.id === requestedLocationId) || null
        : null;
    const currentLocation = currentLocationId
        ? locationList.find((location) => location.id === currentLocationId) || null
        : null;
    const assignedLocation = user?.assigned_location_id
        ? locationList.find((location) => location.id === user.assigned_location_id) || null
        : null;

    let source: ProcurementVisibleContextSource = 'none';
    let location: Location | null = null;

    if (requestedLocation) {
        source = 'requested';
        location = requestedLocation;
    } else if (currentLocation) {
        source = 'store';
        location = currentLocation;
    } else if (locationStoreCurrent) {
        source = 'location-store';
        location = locationStoreCurrent;
    } else if (assignedLocation) {
        source = 'assigned';
        location = assignedLocation;
    }

    const locationId = location?.id || requestedLocationId || currentLocationId || '';
    const canReuseStoreWarehouse = Boolean(
        location?.id
        && currentWarehouseId
        && currentLocationId
        && location.id === currentLocationId,
    );
    const canUseRequestedWarehouse = Boolean(
        location?.id
        && requestedWarehouseId
        && (
            location.default_warehouse_id === requestedWarehouseId
            || (location.type === 'WAREHOUSE' && location.id === requestedWarehouseId)
        ),
    );
    let warehouseId = location?.default_warehouse_id || (location?.type === 'WAREHOUSE' ? location.id : '') || '';
    if (canReuseStoreWarehouse) {
        warehouseId = currentWarehouseId || '';
    }
    if (canUseRequestedWarehouse) {
        warehouseId = requestedWarehouseId || '';
    }

    return {
        locationId,
        warehouseId,
        location,
        locationName: location?.name || 'Sin ubicación',
        source,
    };
}
