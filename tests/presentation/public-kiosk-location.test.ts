import { describe, expect, it } from 'vitest';

import {
    findAvailablePublicKioskLocation,
    isUsablePublicKioskLocationId,
} from '@/presentation/lib/publicKioskLocation';

const STORE_LOCATION = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Farmacia Centro',
};

describe('public kiosk location helpers', () => {
    it('acepta solo IDs persistidos con forma usable para tótems públicos', () => {
        expect(isUsablePublicKioskLocationId(null)).toBe(false);
        expect(isUsablePublicKioskLocationId('loc-1')).toBe(false);
        expect(isUsablePublicKioskLocationId(STORE_LOCATION.id)).toBe(true);
    });

    it('rechaza una ubicación persistida que ya no viene en la lista pública', () => {
        const staleWarehouseId = '22222222-2222-4222-8222-222222222222';

        expect(findAvailablePublicKioskLocation([STORE_LOCATION], staleWarehouseId)).toBeNull();
    });

    it('resuelve la sucursal pública disponible desde la lista server-side', () => {
        expect(findAvailablePublicKioskLocation([STORE_LOCATION], STORE_LOCATION.id)).toEqual(STORE_LOCATION);
    });
});
