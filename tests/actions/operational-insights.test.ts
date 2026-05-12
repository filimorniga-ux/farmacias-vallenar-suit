import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationalAlert } from '@/actions/analytics/operational-alerts-model';
import type { OperationalSuggestion } from '@/actions/analytics/operational-suggestion-model';

const { mockGetOperationalSuggestionsSecure } = vi.hoisted(() => ({
    mockGetOperationalSuggestionsSecure: vi.fn(),
}));

vi.mock('@/actions/analytics/operational-suggestions', () => ({
    getOperationalSuggestionsSecure: mockGetOperationalSuggestionsSecure,
}));

import { getOperationalInsightsSecure } from '@/actions/analytics/operational-insights';

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
    {
        id: 'wms-pending-transfers',
        name: 'Transferencias pendientes',
        definition: 'Shipments inter-sucursal en estado pendiente o en tránsito.',
        trigger: 'wms.pendingTransfers > 0',
        severity: 'warning',
        source: 'wms / shipments',
        owner: 'wms',
        value: 2,
        threshold: '> 0 transferencias pendientes',
        drilldown: { target: 'wms-transfers', filters: scope },
    },
    {
        id: 'procurement-open-orders',
        name: 'Órdenes abiertas por revisar',
        definition: 'Órdenes de compra abiertas que todavía no están recibidas ni canceladas.',
        trigger: 'procurement.openPurchaseOrders > 0',
        severity: 'info',
        source: 'procurement / purchase_orders',
        owner: 'procurement',
        value: 3,
        threshold: '> 0 órdenes abiertas',
        drilldown: { target: 'procurement-orders', filters: scope },
    },
];

const suggestions: OperationalSuggestion[] = [
    {
        id: 'suggest-prepare-smart-order',
        alertId: 'inventory-critical-low-stock',
        title: 'Preparar orden de compra',
        description: 'Abre pedido inteligente con el contexto activo para revisar reposición.',
        actionLabel: 'Preparar pedido',
        href: '/procurement/smart-order?source=operational-suggestion&alertId=inventory-critical-low-stock',
        actionMode: 'prefill-safe',
        safeBecause: 'solo precarga contexto de sucursal/bodega; la orden exige proveedor, cantidades y confirmación',
        priority: 'immediate',
        owner: 'inventario',
        targetModule: 'procurement',
        source: 'inventory-v2 / inventory_batches',
        category: 'guided-action',
        score: 96,
        usefulness: 96,
        friction: 0,
        clickRate: 0.6,
        contextAcceptedRate: 0.83,
        qualityTier: 'recommended',
        tuningReason: 'alta señal de contexto útil',
    },
    {
        id: 'suggest-review-cash-opening',
        alertId: 'sales-no-activity',
        title: 'Revisar apertura de caja',
        description: 'Confirma que la caja esté abierta y que la sucursal pueda vender.',
        actionLabel: 'Ir a caja',
        href: '/caja?source=operational-suggestion&alertId=sales-no-activity',
        actionMode: 'navigate-only',
        safeBecause: 'abre el flujo POS; la sesión real se valida server-side en el módulo de caja',
        priority: 'today',
        owner: 'ventas',
        targetModule: 'caja',
        source: 'sales-v2 / sales',
        category: 'operational-action',
        score: 18,
        usefulness: 40,
        friction: 22,
        clickRate: 0.2,
        contextAcceptedRate: 0.25,
        qualityTier: 'suppressed',
        tuningReason: 'señal baja o fricción alta',
    },
];

const previousAlerts: OperationalAlert[] = [
    {
        ...alerts[0],
        value: 2,
        drilldown: {
            target: alerts[0].drilldown.target,
            filters: {
                ...scope,
                startDate: '2026-04-18',
                endDate: '2026-04-18',
            },
        },
    },
    {
        ...alerts[2],
        value: 2,
        drilldown: {
            target: alerts[2].drilldown.target,
            filters: {
                ...scope,
                startDate: '2026-04-18',
                endDate: '2026-04-18',
            },
        },
    },
];

const previousSuggestions: OperationalSuggestion[] = [
    {
        ...suggestions[0],
        score: 82,
        usefulness: 82,
        clickRate: 0.5,
        contextAcceptedRate: 0.7,
    },
    {
        ...suggestions[1],
        friction: 30,
        contextAcceptedRate: 0.3,
    },
];

describe('getOperationalInsightsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('agrega utilidad, fricción y oportunidades sin crear acciones nuevas', async () => {
        mockGetOperationalSuggestionsSecure.mockResolvedValueOnce({
            success: true,
            data: {
                scope,
                generatedAt: '2026-04-19T12:00:00.000Z',
                alerts,
                alertExclusions: [],
                suggestions,
                suggestionsByAlertId: Object.fromEntries(suggestions.map((suggestion) => [suggestion.alertId, suggestion])),
                rankedAlertIds: suggestions.map((suggestion) => suggestion.alertId),
                suppressedSuggestionIds: ['suggest-review-cash-opening'],
                blockedQuickActions: [],
                exclusions: [],
            },
        }).mockResolvedValueOnce({
            success: true,
            data: {
                scope: {
                    ...scope,
                    startDate: '2026-04-18',
                    endDate: '2026-04-18',
                },
                generatedAt: '2026-04-18T12:00:00.000Z',
                alerts: previousAlerts,
                alertExclusions: [],
                suggestions: previousSuggestions,
                suggestionsByAlertId: Object.fromEntries(previousSuggestions.map((suggestion) => [suggestion.alertId, suggestion])),
                rankedAlertIds: previousSuggestions.map((suggestion) => suggestion.alertId),
                suppressedSuggestionIds: ['suggest-review-cash-opening'],
                blockedQuickActions: [],
                exclusions: [],
            },
        });

        const result = await getOperationalInsightsSecure(scope);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.signalSource).toBe('quick-action-tuning-baseline');
        expect(result.data.topUsefulActions.map((insight) => insight.suggestionId)).toEqual(['suggest-prepare-smart-order']);
        expect(result.data.frictionSignals.map((insight) => insight.suggestionId)).toEqual(['suggest-review-cash-opening']);
        expect(result.data.operationalOpportunities.map((insight) => insight.alertId)).toEqual([
            'inventory-critical-low-stock',
            'wms-pending-transfers',
            'procurement-open-orders',
        ]);
        expect(result.data.operationalOpportunities.map((insight) => insight.priority)).toEqual(['high', 'medium', 'low']);
        expect(result.data.topUsefulActions[0]).toEqual(expect.objectContaining({
            priority: 'high',
            reason: 'La acción muestra buena adopción y el destino reconoce el contexto heredado.',
            evidenceLabel: 'Contexto aceptado 83% · click rate 60%',
            trendDirection: 'up',
            trendWindow: '2026-04-19 a 2026-04-19 vs 2026-04-18 a 2026-04-18',
            trendEvidenceLabel: 'Contexto aceptado sube de 70% a 83%',
        }));
        expect(result.data.frictionSignals[0]).toEqual(expect.objectContaining({
            priority: 'high',
            reason: 'La fricción o el bajo reconocimiento de contexto hacen que no convenga promover esta sugerencia.',
            evidenceLabel: 'Fricción 22 · contexto aceptado 25%',
            trendDirection: 'down',
            trendEvidenceLabel: 'Fricción baja de 30 a 22',
        }));
        expect(result.data.operationalOpportunities[0]).toEqual(expect.objectContaining({
            trendDirection: 'up',
            trendEvidenceLabel: 'Valor actual sube de 2 a 4',
        }));
        expect(result.data.executiveSummary).toEqual([
            expect.objectContaining({
                headline: 'Atención principal: Productos bajo mínimo crítico',
                severity: 'critical',
                summaryType: 'attention',
                supportingEvidence: 'stock_real < stock_min · valor actual 4',
            }),
            expect.objectContaining({
                headline: 'Fricción principal: Revisar apertura de caja',
                severity: 'warning',
                summaryType: 'friction',
                supportingEvidence: 'Fricción 22 · contexto aceptado 25%',
            }),
            expect.objectContaining({
                headline: 'Señal útil: Preparar orden de compra',
                severity: 'info',
                summaryType: 'opportunity',
                supportingEvidence: 'Contexto aceptado 83% · click rate 60%',
            }),
        ]);
        expect(result.data.insights.every((insight) => !('href' in insight))).toBe(true);
        expect(result.data.executiveSummary.every((item) => !('href' in item) && !('action' in item))).toBe(true);
        expect(JSON.stringify(result.data)).not.toContain('/procurement/smart-order');
        expect(result.data.exclusions.map((item) => item.name)).toContain('automatización o ejecución de acciones');
        expect(mockGetOperationalSuggestionsSecure).toHaveBeenNthCalledWith(2, {
            startDate: '2026-04-18',
            endDate: '2026-04-18',
            locationId: scope.locationId,
            warehouseId: scope.warehouseId,
            granularity: 'day',
        });
    });

    it('propaga fallo de sugerencias sin inventar insights', async () => {
        mockGetOperationalSuggestionsSecure.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await getOperationalInsightsSecure(scope);

        expect(result).toEqual({ success: false, error: 'Acceso denegado' });
    });

    it('mantiene tendencia unavailable si la ventana previa no se puede resolver', async () => {
        mockGetOperationalSuggestionsSecure.mockResolvedValueOnce({
            success: true,
            data: {
                scope,
                generatedAt: '2026-04-19T12:00:00.000Z',
                alerts,
                alertExclusions: [],
                suggestions,
                suggestionsByAlertId: Object.fromEntries(suggestions.map((suggestion) => [suggestion.alertId, suggestion])),
                rankedAlertIds: suggestions.map((suggestion) => suggestion.alertId),
                suppressedSuggestionIds: ['suggest-review-cash-opening'],
                blockedQuickActions: [],
                exclusions: [],
            },
        }).mockResolvedValueOnce({
            success: false,
            error: 'Ventana previa no disponible',
        });

        const result = await getOperationalInsightsSecure(scope);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.insights.every((insight) => insight.trendDirection === 'unavailable')).toBe(true);
        expect(result.data.insights.every((insight) => insight.trendEvidenceLabel === 'Sin base temporal suficiente')).toBe(true);
    });
});
