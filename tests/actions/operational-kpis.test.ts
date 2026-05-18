import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireScopedActor, mockQuery } = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockQuery: vi.fn(),
}));

vi.mock('@/actions/admin-scope', () => ({
    ANALYTICS_PAGE_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    ANALYTICS_GLOBAL_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    requireScopedActor: mockRequireScopedActor,
    resolveEffectiveLocation: (
        actor: { role: string; locationId?: string },
        requestedLocationId?: string,
        globalRoles: readonly string[] = ['ADMIN', 'GERENTE_GENERAL'],
    ) => {
        if (globalRoles.includes(actor.role)) {
            return { success: true, locationId: requestedLocationId };
        }
        if (requestedLocationId && requestedLocationId !== actor.locationId) {
            return { success: false, error: 'Acceso denegado a otra ubicación' };
        }
        return { success: true, locationId: actor.locationId };
    },
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

import { getOperationalKpiOverviewSecure } from '@/actions/analytics/operational-kpis';

describe('getOperationalKpiOverviewSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireScopedActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
    });

    it('calcula solo KPIs ready desde fuentes server-side scoped', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ net_sales: '120000', ticket_count: '3' }] })
            .mockResolvedValueOnce({
                rows: [
                    { product_id: 'prod-1', sku: 'SKU-1', name: 'Producto 1', units_sold: '5', total_amount: '50000' },
                ],
            })
            .mockResolvedValueOnce({ rows: [{ open_sessions: '2', closed_sessions: '4', long_open_sessions: '1' }] })
            .mockResolvedValueOnce({ rows: [{ count: '7' }] })
            .mockResolvedValueOnce({
                rows: [
                    { product_id: 'prod-low', sku: 'LOW', name: 'Stock Bajo', quantity: '1', stock_min: '5', warehouse_id: 'wh-1', location_id: 'loc-1' },
                ],
            })
            .mockResolvedValueOnce({ rows: [{ count: '6' }] })
            .mockResolvedValueOnce({ rows: [{ status: 'SENT', count: '3' }, { status: 'REVIEW', count: '3' }] })
            .mockResolvedValueOnce({ rows: [{ pending_transfers: '2', pending_inbound_shipments: '1' }] });

        const result = await getOperationalKpiOverviewSecure({
            startDate: '2026-04-19',
            endDate: '2026-04-19',
            granularity: 'day',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.scope.locationId).toBe('loc-1');
        expect(result.data.sales.netSales).toBe(120000);
        expect(result.data.sales.ticketCount).toBe(3);
        expect(result.data.sales.averageTicket).toBe(40000);
        expect(result.data.cash.longOpenSessions).toBe(1);
        expect(result.data.inventory.criticalLowStockCount).toBe(7);
        expect(result.data.procurement.openPurchaseOrders).toBe(6);
        expect(result.data.wms.pendingTransfers).toBe(2);
        expect(result.data.wms.pendingInboundShipments).toBe(1);
        expect(mockQuery).toHaveBeenCalledTimes(8);
        expect(String(mockQuery.mock.calls[5]?.[0])).toContain("po.status NOT IN ('RECEIVED', 'CANCELLED')");
    });

    it('rechaza locationId fuera del scope del actor antes de consultar KPIs', async () => {
        const result = await getOperationalKpiOverviewSecure({
            startDate: '2026-04-19',
            endDate: '2026-04-19',
            locationId: '123e4567-e89b-12d3-a456-426614174002',
            granularity: 'day',
        });

        expect(result).toEqual({ success: false, error: 'Acceso denegado a otra ubicación' });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rechaza warehouseId que no pertenece a la ubicación efectiva', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ location_id: 'loc-2' }] });

        const result = await getOperationalKpiOverviewSecure({
            startDate: '2026-04-19',
            endDate: '2026-04-19',
            warehouseId: '123e4567-e89b-12d3-a456-426614174000',
            granularity: 'day',
        });

        expect(result).toEqual({ success: false, error: 'La bodega no pertenece a la ubicación efectiva' });
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });
});
