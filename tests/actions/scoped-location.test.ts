import { describe, expect, it, vi } from 'vitest';

import {
    ensureWarehouseBelongsToLocation,
    getWarehouseLocationId,
    resolveScopedLocation,
} from '@/actions/scoped-location';

describe('scoped-location', () => {
    it('resuelve la ubicación del actor no global desde su sesión', () => {
        const result = resolveScopedLocation(
            { role: 'MANAGER', locationId: 'loc-1' },
            'loc-1',
            () => false,
        );

        expect(result).toEqual({ success: true, locationId: 'loc-1' });
    });

    it('rechaza otra ubicación para actor no global', () => {
        const result = resolveScopedLocation(
            { role: 'MANAGER', locationId: 'loc-1' },
            'loc-2',
            () => false,
        );

        expect(result).toEqual({
            success: false,
            error: 'Acceso denegado a otra ubicación',
        });
    });

    it('permite ubicación solicitada para actor global', () => {
        const result = resolveScopedLocation(
            { role: 'ADMIN', locationId: 'loc-1' },
            'loc-2',
            () => true,
        );

        expect(result).toEqual({ success: true, locationId: 'loc-2' });
    });

    it('resuelve la ubicación de una bodega desde el executor', async () => {
        const executor = {
            query: vi.fn().mockResolvedValue({
                rows: [{ location_id: 'loc-warehouse' }],
                rowCount: 1,
            }),
        };

        const result = await getWarehouseLocationId('warehouse-1', executor);

        expect(result).toBe('loc-warehouse');
    });

    it('verifica pertenencia de bodega a ubicación', async () => {
        const executor = {
            query: vi.fn().mockResolvedValue({
                rows: [{ location_id: 'loc-warehouse' }],
                rowCount: 1,
            }),
        };

        await expect(
            ensureWarehouseBelongsToLocation('warehouse-1', 'loc-warehouse', executor),
        ).resolves.toBe(true);
        await expect(
            ensureWarehouseBelongsToLocation('warehouse-1', 'another-location', executor),
        ).resolves.toBe(false);
    });
});
