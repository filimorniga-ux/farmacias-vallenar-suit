import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationalKpiOverview } from '@/actions/analytics/operational-kpis';

const { mockGetOperationalKpiOverviewSecure, mockQuery } = vi.hoisted(() => ({
    mockGetOperationalKpiOverviewSecure: vi.fn(),
    mockQuery: vi.fn(),
}));

vi.mock('@/actions/analytics/operational-kpis', () => ({
    getOperationalKpiOverviewSecure: mockGetOperationalKpiOverviewSecure,
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

import { getOperationalAlertsSecure } from '@/actions/analytics/operational-alerts';
import { OPERATIONAL_ALERT_EXCLUSIONS } from '@/actions/analytics/operational-alerts-model';

const effectiveLocationId = '22222222-2222-4222-8222-222222222222';
const effectiveWarehouseId = '33333333-3333-4333-8333-333333333333';

const overview: OperationalKpiOverview = {
    scope: {
        startDate: '2026-04-01',
        endDate: '2026-04-19',
        locationId: effectiveLocationId,
        warehouseId: effectiveWarehouseId,
        granularity: 'day',
    },
    sales: {
        netSales: 0,
        ticketCount: 0,
        averageTicket: 0,
        topProducts: [],
    },
    cash: {
        openSessions: 2,
        closedSessions: 1,
        longOpenSessions: 1,
    },
    inventory: {
        criticalLowStockCount: 4,
        criticalItems: [],
    },
    procurement: {
        openPurchaseOrders: 3,
        byStatus: [{ status: 'SENT', count: 3 }],
    },
    wms: {
        pendingTransfers: 2,
        pendingInboundShipments: 1,
    },
};

describe('getOperationalAlertsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-19T15:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calcula alertas accionables desde KPIs ready y scope efectivo', async () => {
        mockGetOperationalKpiOverviewSecure.mockResolvedValue({ success: true, data: overview });
        mockQuery.mockResolvedValue({
            rows: [{ count: '2', oldest_created_at: '2026-04-10T12:00:00.000Z' }],
        });

        const result = await getOperationalAlertsSecure({
            startDate: '2026-04-01',
            endDate: '2026-04-19',
            locationId: '11111111-1111-4111-8111-111111111111',
            warehouseId: effectiveWarehouseId,
            granularity: 'day',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.scope.locationId).toBe(effectiveLocationId);
        expect(result.data.alerts.map((alert) => alert.id)).toEqual([
            'cash-long-open-sessions',
            'inventory-critical-low-stock',
            'sales-no-activity',
            'procurement-stale-open-orders',
            'wms-pending-transfers',
            'wms-pending-receptions',
        ]);
        expect(result.data.alerts.find((alert) => alert.id === 'procurement-stale-open-orders')?.drilldown.filters.startDate)
            .toBe('2026-04-10');
        expect(result.data.exclusions).toEqual([...OPERATIONAL_ALERT_EXCLUSIONS]);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0]?.[1]).toEqual([effectiveLocationId, effectiveWarehouseId]);
        expect(String(mockQuery.mock.calls[0]?.[0])).toContain("po.status NOT IN ('RECEIVED', 'CANCELLED')");
    });

    it('devuelve lista vacía cuando no hay señales activas', async () => {
        mockGetOperationalKpiOverviewSecure.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                sales: { ...overview.sales, netSales: 10000, ticketCount: 1, averageTicket: 10000 },
                cash: { openSessions: 0, closedSessions: 1, longOpenSessions: 0 },
                inventory: { criticalLowStockCount: 0, criticalItems: [] },
                procurement: { openPurchaseOrders: 0, byStatus: [] },
                wms: { pendingTransfers: 0, pendingInboundShipments: 0 },
            },
        });
        mockQuery.mockResolvedValue({ rows: [{ count: '0', oldest_created_at: null }] });

        const result = await getOperationalAlertsSecure({
            startDate: '2026-04-19',
            endDate: '2026-04-19',
            granularity: 'day',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.alerts).toEqual([]);
    });

    it('propaga fallo del contrato KPI sin consultar señales adicionales', async () => {
        mockGetOperationalKpiOverviewSecure.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await getOperationalAlertsSecure({
            startDate: '2026-04-19',
            endDate: '2026-04-19',
            granularity: 'day',
        });

        expect(result).toEqual({ success: false, error: 'Acceso denegado' });
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
