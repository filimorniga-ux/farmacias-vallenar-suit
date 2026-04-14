import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
    mockPool: {
        connect: vi.fn(),
    },
}));

const { mockGetValidatedSession } = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
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

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: mockGetValidatedSession,
}));

import { diagnoseDbConnection } from '@/actions/debug/diagnose-db';

describe('diagnoseDbConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: 'admin-1',
            userName: 'Admin',
            role: 'ADMIN',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        });
    });

    it('bloquea actores sin rol administrativo', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'manager-1',
            userName: 'Manager',
            role: 'MANAGER',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await diagnoseDbConnection();

        expect(result.connectionStatus).toBe('FAILED');
        expect(result.error).toBe('Acceso denegado');
        expect(mockPool.connect).not.toHaveBeenCalled();
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
