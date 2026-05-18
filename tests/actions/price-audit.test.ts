import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireScopedActor, mockQuery } = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockQuery: vi.fn(),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: mockRequireScopedActor,
    PRICING_GLOBAL_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/lib/db', () => ({
    query: mockQuery,
    getClient: vi.fn(),
}));

vi.mock('@/actions/notifications-v2', () => ({
    createNotificationSecure: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

import { savePriceProposal, updateBatchProgress } from '@/actions/price-audit';

describe('price-audit RBAC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('bloquea updateBatchProgress sin actor autorizado', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await updateBatchProgress(1, 10, 10, 'IN_PROGRESS');

        expect(result).toEqual({
            success: false,
            error: 'No autorizado',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('bloquea savePriceProposal sin actor autorizado', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await savePriceProposal({
            batch_id: 1,
            product_id: '550e8400-e29b-41d4-a716-446655440001',
            sku: 'SKU-1',
            product_name: 'Producto',
            current_price: 1000,
            cost_price: 700,
        });

        expect(result).toEqual({
            success: false,
            error: 'No autorizado',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
