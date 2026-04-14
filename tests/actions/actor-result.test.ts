import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetActorOrFail, PinRbacErrorMock } = vi.hoisted(() => {
    class PinRbacErrorMock extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockGetActorOrFail: vi.fn(),
        PinRbacErrorMock,
    };
});

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    PinRbacError: PinRbacErrorMock,
}));

import { resolveActorResult } from '@/actions/actor-result';

describe('actor-result', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retorna actor resuelto cuando la sesión es válida', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: 'user-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await resolveActorResult();

        expect(result).toEqual({
            success: true,
            actor: {
                userId: 'user-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
    });

    it('normaliza PinRbacError a respuesta de no autenticado', async () => {
        mockGetActorOrFail.mockRejectedValueOnce(
            new PinRbacErrorMock('AUTH_UNAUTHORIZED', 'Sesión no válida')
        );

        const result = await resolveActorResult();

        expect(result).toEqual({
            success: false,
            error: 'No autenticado',
        });
    });
});
