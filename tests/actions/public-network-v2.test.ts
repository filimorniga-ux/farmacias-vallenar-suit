import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as publicNetworkV2 from '@/actions/public-network-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Public Network V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sanitiza output HTML al listar sucursales públicas', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({
            rows: [
                {
                    id: '1',
                    name: '<b>Sucursal Centro</b>',
                    address: '<script>alert(1)</script>Av. Siempre Viva 123',
                    type: 'STORE',
                },
            ],
        } as any);

        const result = await publicNetworkV2.getPublicLocationsSecure();

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.name).toBe('Sucursal Centro');
        expect(result.data[0]?.address).toContain('alert(1)Av. Siempre Viva 123');
    });

    it('retorna error tipado cuando hay timeout de base de datos', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockRejectedValue(
            new Error('Connection terminated due to connection timeout')
        );

        const result = await publicNetworkV2.getPublicLocationsSecure();

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('DB_TIMEOUT');
        expect(result.retryable).toBe(true);
        expect(result.correlationId).toBeTruthy();
        expect(result.userMessage).toContain('Servicio temporalmente no disponible');
    });
});
