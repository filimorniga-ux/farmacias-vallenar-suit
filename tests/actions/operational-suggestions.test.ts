import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationalAlert } from '@/actions/analytics/operational-alerts-model';

const { mockGetOperationalAlertsSecure } = vi.hoisted(() => ({
    mockGetOperationalAlertsSecure: vi.fn(),
}));

vi.mock('@/actions/analytics/operational-alerts', () => ({
    getOperationalAlertsSecure: mockGetOperationalAlertsSecure,
}));

import {
    getOperationalSuggestionsSecure,
} from '@/actions/analytics/operational-suggestions';
import {
    OPERATIONAL_QUICK_ACTION_GUARDS,
    OPERATIONAL_SUGGESTION_EXCLUSIONS,
} from '@/actions/analytics/operational-suggestion-model';

const scope = {
    startDate: '2026-04-19',
    endDate: '2026-04-19',
    locationId: '11111111-1111-4111-8111-111111111111',
    warehouseId: '22222222-2222-4222-8222-222222222222',
    granularity: 'day' as const,
};

const alerts: OperationalAlert[] = [
    {
        id: 'inventory-critical-low-stock',
        name: 'Productos bajo mínimo crítico',
        definition: 'Productos cuyo stock real está bajo su mínimo configurado.',
        trigger: 'inventory.criticalLowStockCount > 0',
        severity: 'critical',
        source: 'inventory-v2 / inventory_batches',
        owner: 'inventario',
        value: 4,
        threshold: 'stock_real < stock_min',
        drilldown: { target: 'inventory-low-stock', filters: scope },
    },
    {
        id: 'procurement-stale-open-orders',
        name: 'Órdenes abiertas estancadas',
        definition: 'Órdenes de compra abiertas por más de 7 días.',
        trigger: 'openPurchaseOrders.created_at < hoy - 7 días',
        severity: 'warning',
        source: 'procurement / purchase_orders',
        owner: 'procurement',
        value: 2,
        threshold: '> 7 días abiertas',
        drilldown: { target: 'procurement-orders', filters: scope },
    },
    {
        id: 'sales-no-activity',
        name: 'Sin tickets en el período',
        definition: 'No existen ventas completadas para el filtro operativo seleccionado.',
        trigger: 'sales.ticketCount === 0',
        severity: 'info',
        source: 'sales-v2 / sales',
        owner: 'ventas',
        value: 0,
        threshold: '0 tickets',
        drilldown: { target: 'sales-products', filters: scope },
    },
];

describe('getOperationalSuggestionsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mapea alertas a quick actions seguras sin ejecutar acciones', async () => {
        mockGetOperationalAlertsSecure.mockResolvedValue({
            success: true,
            data: {
                scope,
                generatedAt: '2026-04-19T12:00:00.000Z',
                alerts,
                exclusions: [],
            },
        });

        const result = await getOperationalSuggestionsSecure(scope);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.alerts).toEqual(alerts);
        expect(result.data.suggestions.map((suggestion) => suggestion.id)).toEqual([
            'suggest-prepare-smart-order',
            'suggest-follow-up-stale-orders',
            'suggest-review-cash-opening',
        ]);
        expect(result.data.rankedAlertIds).toEqual([
            'inventory-critical-low-stock',
            'procurement-stale-open-orders',
            'sales-no-activity',
        ]);
        expect(result.data.suggestions.map((suggestion) => suggestion.actionMode)).toEqual([
            'prefill-safe',
            'prefill-safe',
            'navigate-only',
        ]);
        expect(result.data.suggestions.map((suggestion) => suggestion.category)).toEqual([
            'guided-action',
            'informational-navigation',
            'operational-action',
        ]);
        expect(result.data.suggestions[0]).toEqual(expect.objectContaining({
            qualityTier: 'recommended',
            score: expect.any(Number),
            usefulness: expect.any(Number),
            friction: expect.any(Number),
            tuningReason: 'alta señal de contexto útil',
        }));
        expect(result.data.suppressedSuggestionIds).toEqual(['suggest-review-cash-opening']);
        expect(result.data.suggestions.every((suggestion) => suggestion.safeBecause.length > 0)).toBe(true);
        expect(result.data.suggestionsByAlertId['inventory-critical-low-stock']?.href)
            .toBe('/procurement/smart-order?startDate=2026-04-19&endDate=2026-04-19&locationId=11111111-1111-4111-8111-111111111111&warehouseId=22222222-2222-4222-8222-222222222222&source=operational-suggestion&alertId=inventory-critical-low-stock');
        expect(result.data.suggestionsByAlertId['procurement-stale-open-orders']?.href)
            .toBe('/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=11111111-1111-4111-8111-111111111111&warehouseId=22222222-2222-4222-8222-222222222222&source=operational-suggestion&alertId=procurement-stale-open-orders&tab=procurement&detail=open-orders');
        expect(result.data.blockedQuickActions).toEqual([
            OPERATIONAL_QUICK_ACTION_GUARDS[0],
            OPERATIONAL_QUICK_ACTION_GUARDS[4],
        ]);
        expect(result.data.exclusions).toEqual([...OPERATIONAL_SUGGESTION_EXCLUSIONS]);
    });

    it('devuelve vacío cuando no hay alertas activas', async () => {
        mockGetOperationalAlertsSecure.mockResolvedValue({
            success: true,
            data: {
                scope,
                generatedAt: '2026-04-19T12:00:00.000Z',
                alerts: [],
                exclusions: [],
            },
        });

        const result = await getOperationalSuggestionsSecure(scope);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.suggestions).toEqual([]);
        expect(result.data.suggestionsByAlertId).toEqual({});
        expect(result.data.rankedAlertIds).toEqual([]);
        expect(result.data.suppressedSuggestionIds).toEqual([]);
        expect(result.data.blockedQuickActions).toEqual([]);
    });

    it('propaga fallo de alertas sin inventar sugerencias', async () => {
        mockGetOperationalAlertsSecure.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await getOperationalSuggestionsSecure(scope);

        expect(result).toEqual({ success: false, error: 'Acceso denegado' });
    });
});
