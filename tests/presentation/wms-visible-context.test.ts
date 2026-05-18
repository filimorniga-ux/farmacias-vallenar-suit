import { describe, expect, it } from 'vitest';
import type { Location } from '@/domain/types';
import { resolveWmsVisibleContext } from '@/presentation/lib/wms-visible-context';

const locations: Location[] = [
    {
        id: 'loc-1',
        type: 'STORE',
        name: 'Sucursal Centro',
        address: 'Centro 123',
        associated_kiosks: [],
        default_warehouse_id: 'wh-1',
    },
    {
        id: 'loc-2',
        type: 'STORE',
        name: 'Sucursal Norte',
        address: 'Norte 456',
        associated_kiosks: [],
        default_warehouse_id: 'wh-2',
    },
];

describe('resolveWmsVisibleContext', () => {
    it('prefiere el contexto actual del store cuando existe metadata coherente', () => {
        const result = resolveWmsVisibleContext({
            currentLocationId: 'loc-1',
            currentWarehouseId: 'wh-1',
            user: { assigned_location_id: 'loc-2' },
            locations,
        });

        expect(result.locationId).toBe('loc-1');
        expect(result.warehouseId).toBe('wh-1');
        expect(result.source).toBe('store');
        expect(result.shouldSyncStore).toBe(false);
    });

    it('cae a location-store cuando el store operativo no está inicializado', () => {
        const result = resolveWmsVisibleContext({
            currentLocationId: '',
            currentWarehouseId: '',
            locationStoreCurrent: locations[0],
            locations,
        });

        expect(result.locationId).toBe('loc-1');
        expect(result.warehouseId).toBe('wh-1');
        expect(result.source).toBe('location-store');
        expect(result.shouldSyncStore).toBe(true);
    });

    it('cae a la ubicación asignada cuando no existe contexto cargado en cliente', () => {
        const result = resolveWmsVisibleContext({
            currentLocationId: '',
            currentWarehouseId: '',
            user: { assigned_location_id: 'loc-2' },
            locations,
        });

        expect(result.locationId).toBe('loc-2');
        expect(result.warehouseId).toBe('wh-2');
        expect(result.source).toBe('assigned');
        expect(result.shouldSyncStore).toBe(true);
    });

    it('no reemplaza un id de store si todavía no existe metadata cargada', () => {
        const result = resolveWmsVisibleContext({
            currentLocationId: 'loc-pendiente',
            currentWarehouseId: 'wh-pendiente',
            locations: [],
        });

        expect(result.locationId).toBe('loc-pendiente');
        expect(result.warehouseId).toBe('wh-pendiente');
        expect(result.source).toBe('none');
        expect(result.shouldSyncStore).toBe(false);
    });
});
