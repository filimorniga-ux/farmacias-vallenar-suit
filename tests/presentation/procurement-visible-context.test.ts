import { describe, expect, it } from 'vitest';
import type { Location } from '@/domain/types';
import { resolveProcurementVisibleContext } from '@/presentation/lib/procurement-visible-context';

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

describe('resolveProcurementVisibleContext', () => {
    it('prioriza la ubicación solicitada y alinea su bodega por default', () => {
        const result = resolveProcurementVisibleContext({
            requestedLocationId: 'loc-2',
            currentLocationId: 'loc-1',
            currentWarehouseId: 'wh-1',
            locations,
        });

        expect(result.locationId).toBe('loc-2');
        expect(result.warehouseId).toBe('wh-2');
        expect(result.source).toBe('requested');
    });

    it('acepta requestedWarehouseId solo cuando pertenece a la ubicación solicitada', () => {
        const aligned = resolveProcurementVisibleContext({
            requestedLocationId: 'loc-2',
            requestedWarehouseId: 'wh-2',
            currentLocationId: 'loc-1',
            currentWarehouseId: 'wh-1',
            locations,
        });
        const mismatched = resolveProcurementVisibleContext({
            requestedLocationId: 'loc-2',
            requestedWarehouseId: 'wh-externa',
            currentLocationId: 'loc-1',
            currentWarehouseId: 'wh-1',
            locations,
        });

        expect(aligned.warehouseId).toBe('wh-2');
        expect(mismatched.warehouseId).toBe('wh-2');
    });

    it('reutiliza la bodega del store solo cuando coincide con la ubicación activa', () => {
        const result = resolveProcurementVisibleContext({
            currentLocationId: 'loc-1',
            currentWarehouseId: 'wh-store',
            locations,
        });

        expect(result.locationId).toBe('loc-1');
        expect(result.warehouseId).toBe('wh-store');
        expect(result.source).toBe('store');
    });

    it('cae a la ubicación asignada cuando no hay contexto cliente cargado', () => {
        const result = resolveProcurementVisibleContext({
            user: { assigned_location_id: 'loc-2' },
            locations,
        });

        expect(result.locationId).toBe('loc-2');
        expect(result.warehouseId).toBe('wh-2');
        expect(result.source).toBe('assigned');
    });
});
