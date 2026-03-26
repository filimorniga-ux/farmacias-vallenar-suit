import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';
import { getManagerRealTimeDataSecure } from '@/actions/manager-dashboard-v2';

describe('manager-dashboard-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza cuando no existe sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await getManagerRealTimeDataSecure();

        expect(result).toEqual({
            success: false,
            error: 'Sesión no válida. Vuelve a iniciar sesión.',
        });
        expect(query).not.toHaveBeenCalled();
    });

    it('rechaza roles fuera del grupo de gerencia', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
            locationId: 'loc-1',
        });

        const result = await getManagerRealTimeDataSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Rol CASHIER no autorizado');
        expect(query).not.toHaveBeenCalled();
    });

    it('acepta roles de gerencia aunque vengan con formato legacy', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: ' manager ',
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
            locationId: 'loc-1',
        });

        vi.mocked(query).mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
            command: '',
            oid: 0,
            fields: [],
        });

        const result = await getManagerRealTimeDataSecure();

        expect(result).toEqual({
            success: true,
            data: {
                branches: [],
            },
        });
        expect(query).toHaveBeenCalledTimes(1);
    });
});
