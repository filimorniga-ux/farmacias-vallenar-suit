import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockRequireScopedActor,
    mockRedirect,
} = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: (...args: unknown[]) => mockRequireScopedActor(...args),
}));

vi.mock('@/app/network/NetworkClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="network-client-page" />,
}));

import NetworkRoutePage from '@/app/network/page';

describe('/app/network/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige si el actor no está autorizado', async () => {
        mockRequireScopedActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(NetworkRoutePage()).rejects.toThrow('NEXT_REDIRECT');
    });

    it('renderiza la superficie de red con actor válido', async () => {
        mockRequireScopedActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        const result = await NetworkRoutePage();

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });
});
