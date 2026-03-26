import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
    mockPool: {
        connect: vi.fn(),
    },
}));

vi.mock('@/lib/db', () => ({
    pool: mockPool,
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

import { diagnoseDbConnection } from '@/actions/debug/diagnose-db';

describe('diagnoseDbConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redacta detalles sensibles cuando falla la conexión', async () => {
        mockPool.connect.mockRejectedValueOnce(new Error('password authentication failed for user postgres'));

        const result = await diagnoseDbConnection();

        expect(result.connectionStatus).toBe('FAILED');
        expect(result.error).toBe('No fue posible conectar a la base de datos');
        expect('envVarLength' in result).toBe(false);
        expect(result.fileSystem).toBeUndefined();
    });
});
