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

    it('rechaza roles sin permisos operativos', async () => {
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

    it('permite acceso a roles autorizados y mantiene la respuesta de diagnóstico', async () => {
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
        expect(payload.data.database_name).toBe('farmacias');
        expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
});
