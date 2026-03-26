import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

import { requireApiRoles } from '@/lib/api-auth';
import { getValidatedSession } from '@/lib/server-session';

describe('api-auth session validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza si no existe sesión validada en DB', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await requireApiRoles(['ADMIN']);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.response.status).toBe(401);
    });

    it('rechaza si el rol validado no tiene permisos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 4,
            sessionToken: 'token-valido',
        });

        const result = await requireApiRoles(['ADMIN']);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.response.status).toBe(403);
    });

    it('acepta solo la sesión validada server-side', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 4,
            sessionToken: 'token-valido',
        });

        const result = await requireApiRoles(['ADMIN']);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session.role).toBe('ADMIN');
        expect(result.session.sessionToken).toBe('token-valido');
    });
});
