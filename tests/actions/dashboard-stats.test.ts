import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireScopedActor, mockQuery } = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockQuery: vi.fn(),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: mockRequireScopedActor,
    hasGlobalScope: vi.fn((role: string, globalRoles: readonly string[]) => globalRoles.includes(role as any)),
    ANALYTICS_GLOBAL_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

import { getDashboardStats } from '@/actions/analytics/dashboard-stats';

describe('getDashboardStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('devuelve ceros cuando no hay actor autorizado', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'No autenticado',
        });

        const result = await getDashboardStats();

        expect(result).toEqual({
            todaySales: 0,
            transactionCount: 0,
            lowStockCount: 0,
            pendingOrders: 0,
            totalInventoryValue: 0,
            santiagoSales: 0,
            colchaguaSales: 0,
            lastSaleTime: null,
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('fuerza scope de ubicación para actores no globales', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-7',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    total_sales: 10,
                    tx_count: 2,
                    last_sale: '2026-04-02T12:00:00Z',
                    santiago_sales: 0,
                    colchagua_sales: 10,
                }],
            })
            .mockResolvedValueOnce({ rows: [{ count: 3 }] })
            .mockResolvedValueOnce({ rows: [{ total_value: 999 }] })
            .mockResolvedValueOnce({ rows: [{ count: 4 }] });

        const result = await getDashboardStats();

        expect(result.todaySales).toBe(10);
        expect(mockQuery).toHaveBeenCalledTimes(4);
        expect(mockQuery.mock.calls[0]?.[1]).toEqual(['loc-7']);
        expect(mockQuery.mock.calls[1]?.[1]).toEqual(['loc-7']);
        expect(String(mockQuery.mock.calls[3]?.[0] || '')).toContain('po.target_warehouse_id');
        expect(String(mockQuery.mock.calls[3]?.[0] || '')).not.toContain('po.warehouse_id');
    });
});
