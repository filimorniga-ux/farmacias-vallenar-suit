import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireScopedActor, mockPool } = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockPool: {
        query: vi.fn(),
        connect: vi.fn(),
    },
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: mockRequireScopedActor,
    PRICING_GLOBAL_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
    PRICING_WRITE_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/lib/db', () => ({
    pool: mockPool,
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

import { getPendingRecommendations, resolveRecommendation } from '@/actions/pricing-intelligence';

describe('pricing-intelligence RBAC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza recomendaciones pendientes sin rol global de pricing', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await getPendingRecommendations();

        expect(result).toEqual({
            success: false,
            error: 'Acceso denegado',
        });
        expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('rechaza resolver recomendaciones sin rol de escritura', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await resolveRecommendation('550e8400-e29b-41d4-a716-446655440001', 'ACCEPTED');

        expect(result).toEqual({
            success: false,
            error: 'Acceso denegado',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });
});
