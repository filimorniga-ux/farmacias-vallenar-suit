import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockLogger, mockNoStore, mockState } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    mockNoStore: vi.fn(),
    mockState: {
        currentIp: '203.0.113.1',
    },
}));

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));
vi.mock('next/cache', () => ({
    unstable_noStore: mockNoStore,
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return mockState.currentIp;
            return null;
        },
    })),
}));

import * as publicNetworkV2 from '@/actions/public-network-v2';

describe('Public Network V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    });

    it('sanitiza output HTML al listar sucursales públicas', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                {
                    id: '1',
                    name: '<b>Sucursal Centro</b>',
                    address: '<script>alert(1)</script>Av. Siempre Viva 123',
                    type: 'STORE',
                },
            ],
        });

        const result = await publicNetworkV2.getPublicLocationsSecure();

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("type = 'STORE'"));
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.name).toBe('Sucursal Centro');
        expect(result.data[0]?.address).toBe('Av. Siempre Viva 123');
        expect(result.data[0]?.address).not.toContain('alert(1)');
    });

    it('no expone bodegas ni casa matriz aunque lleguen desde la DB', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { id: 'store-1', name: 'Sucursal Centro', address: 'Centro', type: 'STORE' },
                { id: 'wh-1', name: 'Bodega Central', address: 'Bodega', type: 'WAREHOUSE' },
                { id: 'hq-1', name: 'Casa Matriz', address: 'HQ', type: 'HQ' },
            ],
        });

        const result = await publicNetworkV2.getPublicLocationsSecure();

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual([
            expect.objectContaining({ id: 'store-1', type: 'STORE' }),
        ]);
    });

    it('retorna error tipado cuando hay timeout de base de datos', async () => {
        mockQuery.mockRejectedValue(
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

    it('aplica rate limit por IP antes de consultar sucursales', async () => {
        mockState.currentIp = '203.0.113.250';
        mockQuery.mockResolvedValue({ rows: [] });

        for (let i = 0; i < 10; i++) {
            await publicNetworkV2.getPublicLocationsSecure();
        }

        const limited = await publicNetworkV2.getPublicLocationsSecure();

        expect(limited.success).toBe(false);
        if (limited.success) return;
        expect(limited.code).toBe('PUBLIC_NETWORK_RATE_LIMIT');
        expect(mockQuery).toHaveBeenCalledTimes(10);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ ip: '203.0.113.250' }),
            'Public locations rate limit exceeded'
        );
    });
});
