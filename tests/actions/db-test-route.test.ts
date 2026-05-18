import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
    mockPool: {
        query: vi.fn(),
        totalCount: 4,
        idleCount: 2,
        waitingCount: 0,
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

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

import { GET } from '@/app/api/db-test/route';
import { getValidatedSession } from '@/lib/server-session';

describe('GET /api/db-test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza requests sin sesión activa', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('rechaza roles sin permisos administrativos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.code).toBe('AUTH_FORBIDDEN');
    });

    it('rechaza MANAGER porque el diagnóstico DB es administrativo', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 2,
            sessionToken: 'token',
        });

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.code).toBe('AUTH_FORBIDDEN');
        expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('permite acceso a roles autorizados sin exponer detalles internos de DB', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 2,
            sessionToken: 'token',
        });
        mockPool.query.mockResolvedValueOnce({
            rows: [{
                server_time: new Date('2026-03-26T12:00:00.000Z').toISOString(),
                database_name: 'farmacias',
                db_user: 'postgres',
                active_users: '3',
            }],
        });

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.active_users).toBe(3);
        expect(payload.data.database_name).toBeUndefined();
        expect(payload.data.db_user).toBeUndefined();
        expect(payload.env).toBeUndefined();
        expect(payload.connection).toBeUndefined();
        expect(payload.diagnostics.elapsed_ms).toBeTypeOf('number');
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('redacta detalles internos cuando el diagnóstico falla', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 2,
            sessionToken: 'token',
        });
        mockPool.query.mockRejectedValueOnce(new Error('password authentication failed for user postgres'));

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('No fue posible ejecutar el diagnóstico de base de datos');
        expect(payload.code).toBeUndefined();
        expect(payload.env).toBeUndefined();
        expect(response.headers.get('cache-control')).toContain('no-store');
    });
});
