import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPublicLocationsSecure } = vi.hoisted(() => ({
    getPublicLocationsSecure: vi.fn(),
}));

vi.mock('@/actions/public-network-v2', () => ({
    getPublicLocationsSecure,
}));

import { getPublicLocations } from '@/actions/public-network';

describe('public-network legacy wrapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('delega en la versión segura sin mantener una query pública duplicada', async () => {
        getPublicLocationsSecure.mockResolvedValue({
            success: true,
            data: [{ id: 'loc-1', name: 'Sucursal Centro', address: 'Centro', type: 'STORE' }],
        });

        const result = await getPublicLocations();

        expect(result).toEqual({
            success: true,
            data: [{ id: 'loc-1', name: 'Sucursal Centro', address: 'Centro', type: 'STORE' }],
        });
        expect(getPublicLocationsSecure).toHaveBeenCalledTimes(1);
    });

    it('preserva error público sin exponer metadatos internos del action seguro', async () => {
        getPublicLocationsSecure.mockResolvedValue({
            success: false,
            error: 'technical',
            code: 'DB_TIMEOUT',
            retryable: true,
            correlationId: 'corr-1',
            userMessage: 'Servicio temporalmente no disponible',
        });

        const result = await getPublicLocations();

        expect(result).toEqual({
            success: false,
            error: 'Servicio temporalmente no disponible',
        });
    });
});
