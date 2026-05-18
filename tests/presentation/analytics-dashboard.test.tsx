/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationalKpiOverview } from '@/actions/analytics/operational-kpis';
import type { OperationalAlert } from '@/actions/analytics/operational-alerts-model';
import type { OperationalSuggestion } from '@/actions/analytics/operational-suggestion-model';
import type { OperationalInsightsResult } from '@/actions/analytics/operational-insights-model';

const { mockGetOperationalKpiOverviewSecure, mockGetOperationalSuggestionsSecure, mockGetOperationalInsightsSecure } = vi.hoisted(() => ({
    mockGetOperationalKpiOverviewSecure: vi.fn(),
    mockGetOperationalSuggestionsSecure: vi.fn(),
    mockGetOperationalInsightsSecure: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: vi.fn(),
}));

vi.mock('@/actions/analytics/operational-kpis', () => ({
    getOperationalKpiOverviewSecure: mockGetOperationalKpiOverviewSecure,
}));

vi.mock('@/actions/analytics/operational-suggestions', () => ({
    getOperationalSuggestionsSecure: mockGetOperationalSuggestionsSecure,
}));

vi.mock('@/actions/analytics/operational-insights', () => ({
    getOperationalInsightsSecure: mockGetOperationalInsightsSecure,
}));

vi.mock('@/presentation/components/analytics/ExecutiveDashboard', () => ({
    __esModule: true,
    default: () => <div data-testid="executive-dashboard" />,
}));

import AnalyticsDashboard from '@/presentation/components/analytics/AnalyticsDashboard';
import { OPERATIONAL_QUICK_ACTION_UX_EVENT } from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
} from '@/lib/operational-message-catalog';

const overview: OperationalKpiOverview = {
    scope: {
        startDate: '2026-04-19',
        endDate: '2026-04-19',
        locationId: 'loc-1',
        granularity: 'day',
    },
    sales: {
        netSales: 120000,
        ticketCount: 3,
        averageTicket: 40000,
        topProducts: [
            { productId: 'prod-1', sku: 'SKU-1', name: 'Producto 1', unitsSold: 5, totalAmount: 50000 },
        ],
    },
    cash: {
        openSessions: 2,
        closedSessions: 4,
        longOpenSessions: 1,
    },
    inventory: {
        criticalLowStockCount: 7,
        criticalItems: [
            { productId: 'prod-low', sku: 'LOW', name: 'Stock Bajo', quantity: 1, stockMin: 5, warehouseId: 'wh-1', locationId: 'loc-1' },
        ],
    },
    procurement: {
        openPurchaseOrders: 6,
        byStatus: [{ status: 'SENT', count: 6 }],
    },
    wms: {
        pendingTransfers: 2,
        pendingInboundShipments: 1,
    },
};

const alerts: OperationalAlert[] = [
    {
        id: 'cash-long-open-sessions',
        name: 'Cajas abiertas demasiado tiempo',
        definition: 'Cajas con sesión abierta por más de 12 horas.',
        trigger: 'cash.longOpenSessions > 0',
        severity: 'critical',
        source: 'cash-management-v2 / cash_register_sessions',
        owner: 'caja',
        value: 1,
        threshold: '> 12 horas',
        drilldown: {
            target: 'cash',
            filters: { startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1' },
        },
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
        drilldown: {
            target: 'wms-transfers',
            filters: { startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1' },
        },
    },
];

const suggestions: OperationalSuggestion[] = [
    {
        id: 'suggest-review-long-cash-session',
        alertId: 'cash-long-open-sessions',
        title: 'Revisar caja abierta',
        description: 'Identifica la sesión larga antes de cerrar turno o seguir vendiendo.',
        actionLabel: 'Revisar caja',
        href: '/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1&source=operational-suggestion&alertId=cash-long-open-sessions&tab=cash',
        actionMode: 'prefill-safe',
        safeBecause: 'abre reporte de caja con filtros efectivos; no cierra ni modifica la sesión',
        priority: 'immediate',
        owner: 'caja',
        targetModule: 'reports',
        source: 'cash-management-v2 / cash_register_sessions',
        category: 'informational-navigation',
        score: 94,
        usefulness: 94,
        friction: 0,
        clickRate: 0.5,
        contextAcceptedRate: 1,
        qualityTier: 'recommended',
        tuningReason: 'alta señal de contexto útil',
    },
    {
        id: 'suggest-inspect-pending-transfers',
        alertId: 'wms-pending-transfers',
        title: 'Inspeccionar transferencias',
        description: 'Revisa envíos pendientes antes de reintentar o pedir confirmación.',
        actionLabel: 'Ver transferencias',
        href: '/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1&source=operational-suggestion&alertId=wms-pending-transfers&tab=logistics&detail=transfers',
        actionMode: 'prefill-safe',
        safeBecause: 'abre logística filtrada; no reintenta ni cambia estado WMS',
        priority: 'today',
        owner: 'wms',
        targetModule: 'wms',
        source: 'wms / shipments',
        category: 'informational-navigation',
        score: 66,
        usefulness: 71,
        friction: 5,
        clickRate: 0.3,
        contextAcceptedRate: 0.75,
        qualityTier: 'recommended',
        tuningReason: 'alta señal de contexto útil',
    },
];

const initialSuggestions = {
    success: true as const,
    data: {
        scope: overview.scope,
        generatedAt: '2026-04-19T12:00:00.000Z',
        alerts,
        alertExclusions: [],
        suggestions,
        suggestionsByAlertId: Object.fromEntries(suggestions.map((suggestion) => [suggestion.alertId, suggestion])),
        rankedAlertIds: suggestions.map((suggestion) => suggestion.alertId),
        suppressedSuggestionIds: [],
        blockedQuickActions: [],
        exclusions: [],
    },
};

const initialInsights: OperationalInsightsResult = {
    success: true,
    data: {
        scope: overview.scope,
        generatedAt: '2026-04-19T12:00:00.000Z',
        signalSource: 'quick-action-tuning-baseline',
        topUsefulActions: [
            {
                id: 'value-suggest-review-long-cash-session',
                title: 'Acción útil: Revisar caja abierta',
                description: 'Mantener visible: la señal actual indica buena adopción y contexto reconocido.',
                kind: 'quick-action-value',
                priority: 'high',
                severity: 'info',
                owner: 'caja',
                source: 'cash-management-v2 / cash_register_sessions',
                signal: 'alta señal de contexto útil',
                reason: 'La acción muestra buena adopción y el destino reconoce el contexto heredado.',
                evidenceLabel: `${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} 100% · click rate 50%`,
                trendDirection: 'up',
                trendWindow: '2026-04-19 a 2026-04-19 vs 2026-04-18 a 2026-04-18',
                trendEvidenceLabel: `${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} sube de 80% a 100%`,
                suggestionId: 'suggest-review-long-cash-session',
                alertId: 'cash-long-open-sessions',
                metrics: [
                    { label: 'Click rate', value: 50, unit: 'percent' },
                    { label: OPERATIONAL_CONTEXT_STATUS_LABELS.accepted, value: 100, unit: 'percent' },
                    { label: 'Score', value: 94, unit: 'score' },
                ],
            },
        ],
        frictionSignals: [
            {
                id: 'friction-suggest-inspect-pending-transfers',
                title: 'Baja señal: Inspeccionar transferencias',
                description: 'Reducir ruido: conviene mantenerla textual o revisar el handoff antes de promoverla.',
                kind: 'quick-action-friction',
                priority: 'high',
                severity: 'warning',
                owner: 'wms',
                source: 'wms / shipments',
                signal: 'señal baja o fricción alta',
                reason: 'La fricción o el bajo reconocimiento de contexto hacen que no convenga promover esta sugerencia.',
                evidenceLabel: 'Fricción 22 · contexto aceptado 20%',
                trendDirection: 'down',
                trendWindow: '2026-04-19 a 2026-04-19 vs 2026-04-18 a 2026-04-18',
                trendEvidenceLabel: 'Fricción baja de 30 a 22',
                suggestionId: 'suggest-inspect-pending-transfers',
                alertId: 'wms-pending-transfers',
                metrics: [
                    { label: 'Fricción', value: 22, unit: 'score' },
                    { label: OPERATIONAL_CONTEXT_STATUS_LABELS.accepted, value: 20, unit: 'percent' },
                    { label: 'Click rate', value: 10, unit: 'percent' },
                ],
            },
        ],
        operationalOpportunities: [
            {
                id: 'opportunity-cash-long-open-sessions',
                title: 'Oportunidad: Cajas abiertas demasiado tiempo',
                description: 'Cajas con sesión abierta por más de 12 horas. Este insight solo explica el desvío activo; no ejecuta acciones.',
                kind: 'operational-opportunity',
                priority: 'high',
                severity: 'critical',
                owner: 'caja',
                source: 'cash-management-v2 / cash_register_sessions',
                signal: 'cash.longOpenSessions > 0',
                reason: 'La prioridad viene de la severidad operativa actual de la alerta.',
                evidenceLabel: '> 12 horas · valor actual 1',
                trendDirection: 'flat',
                trendWindow: '2026-04-19 a 2026-04-19 vs 2026-04-18 a 2026-04-18',
                trendEvidenceLabel: 'Valor actual se mantiene en 1',
                alertId: 'cash-long-open-sessions',
                metrics: [
                    { label: 'Valor actual', value: 1, unit: 'count' },
                ],
            },
        ],
        insights: [],
        executiveSummary: [
            {
                id: 'summary-attention-opportunity-cash-long-open-sessions',
                headline: 'Atención principal: Cajas abiertas demasiado tiempo',
                severity: 'critical',
                summaryType: 'attention',
                supportingEvidence: '> 12 horas · valor actual 1',
                sourceInsightId: 'opportunity-cash-long-open-sessions',
            },
            {
                id: 'summary-friction-friction-suggest-inspect-pending-transfers',
                headline: 'Fricción principal: Inspeccionar transferencias',
                severity: 'warning',
                summaryType: 'friction',
                supportingEvidence: 'Fricción 22 · contexto aceptado 20%',
                sourceInsightId: 'friction-suggest-inspect-pending-transfers',
            },
            {
                id: 'summary-opportunity-value-suggest-review-long-cash-session',
                headline: 'Señal útil: Revisar caja abierta',
                severity: 'info',
                summaryType: 'opportunity',
                supportingEvidence: `${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} 100% · click rate 50%`,
                sourceInsightId: 'value-suggest-review-long-cash-session',
            },
        ],
        exclusions: [],
    },
};

const insightsWithInformationalSignal: OperationalInsightsResult = {
    success: true,
    data: {
        ...initialInsights.data,
        topUsefulActions: [],
        frictionSignals: [],
        operationalOpportunities: [],
        insights: [
            {
                id: 'info-recurring-low-stock',
                title: 'Señal informativa: Bajo stock recurrente',
                description: 'El mismo quiebre aparece en varias revisiones del período.',
                kind: 'operational-opportunity',
                priority: 'low',
                severity: 'info',
                owner: 'inventario',
                source: 'inventory-v2 / stock thresholds',
                signal: 'repetición simple',
                reason: 'Sirve como contexto, pero no necesita atención inmediata.',
                evidenceLabel: '3 apariciones en 7 días',
                trendDirection: 'up',
                trendWindow: 'últimos 7 días vs 7 previos',
                trendEvidenceLabel: 'Sube de 1 a 3 apariciones',
                metrics: [
                    { label: 'Valor actual', value: 3, unit: 'count' },
                ],
            },
        ],
    },
};

const suppressedTransferSuggestion: OperationalSuggestion = {
    ...suggestions[1],
    score: 18,
    usefulness: 40,
    friction: 22,
    clickRate: 0.1,
    contextAcceptedRate: 0.2,
    qualityTier: 'suppressed',
    tuningReason: 'señal baja o fricción alta',
};

const suggestionsWithSuppressedTransfer = [suggestions[0], suppressedTransferSuggestion];
const suggestionsResultWithSuppressed = {
    success: true as const,
    data: {
        ...initialSuggestions.data,
        suggestions: suggestionsWithSuppressedTransfer,
        suggestionsByAlertId: Object.fromEntries(
            suggestionsWithSuppressedTransfer.map((suggestion) => [suggestion.alertId, suggestion])
        ),
        rankedAlertIds: suggestionsWithSuppressedTransfer.map((suggestion) => suggestion.alertId),
        suppressedSuggestionIds: [suppressedTransferSuggestion.id],
    },
};

describe('AnalyticsDashboard operativo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetOperationalInsightsSecure.mockResolvedValue(initialInsights);
    });

    it('renderiza solo KPIs ready del contrato operativo', () => {
        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
            />
        );

        expect(screen.getByText('Ventas netas')).toBeTruthy();
        expect(screen.getByText('$120.000')).toBeTruthy();
        expect(screen.getByText('Ticket promedio')).toBeTruthy();
        expect(screen.getByText('Cajas abiertas')).toBeTruthy();
        expect(screen.getByText('Bajo stock crítico')).toBeTruthy();
        expect(screen.getByText('Producto 1')).toBeTruthy();
        expect(screen.getByText('Stock Bajo')).toBeTruthy();
        expect(screen.queryByText(/margen/i)).toBeNull();
        expect(screen.queryByText(/forecast/i)).toBeNull();
        expect(screen.queryByText(/sla/i)).toBeNull();
    });

    it('aplica filtros llamando al contrato server-side', async () => {
        mockGetOperationalKpiOverviewSecure.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                scope: { ...overview.scope, locationId: 'loc-2' },
                sales: { ...overview.sales, netSales: 90000 },
            },
        });
        mockGetOperationalSuggestionsSecure.mockResolvedValue({
            success: true,
            data: {
                ...initialSuggestions.data,
                scope: { ...overview.scope, locationId: 'loc-2' },
                alerts: [],
                suggestions: [],
                suggestionsByAlertId: {},
                rankedAlertIds: [],
                suppressedSuggestionIds: [],
            },
        });

        render(
            <AnalyticsDashboard
                initialLocations={[
                    { id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never,
                    { id: 'loc-2', name: 'Sucursal 2', type: 'STORE' } as never,
                ]}
                userRole="ADMIN"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
            />
        );

        fireEvent.change(screen.getByLabelText(/Sucursal/i), { target: { value: 'loc-2' } });
        fireEvent.click(screen.getByRole('button', { name: /Aplicar filtros/i }));

        await waitFor(() => {
            expect(mockGetOperationalKpiOverviewSecure).toHaveBeenCalledWith({
                startDate: '2026-04-19',
                endDate: '2026-04-19',
                locationId: 'loc-2',
                granularity: 'day',
            });
            expect(mockGetOperationalSuggestionsSecure).toHaveBeenCalledWith({
                startDate: '2026-04-19',
                endDate: '2026-04-19',
                locationId: 'loc-2',
                granularity: 'day',
            });
            expect(mockGetOperationalInsightsSecure).toHaveBeenCalledWith({
                startDate: '2026-04-19',
                endDate: '2026-04-19',
                locationId: 'loc-2',
                granularity: 'day',
            });
        });
        await screen.findByText('$90.000');
    });

    it('expone drill-downs con filtros efectivos del contrato server-side', () => {
        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-01', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
            />
        );

        expect(screen.getByRole('link', { name: /Ventas netas/i }).getAttribute('href'))
            .toBe('/reports/sales-by-product?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1');
        expect(screen.getAllByRole('link', { name: /Ver detalle/i }).some((link) =>
            link.getAttribute('href') === '/reports?tab=cash&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1'
        )).toBe(true);
        expect(screen.getByRole('link', { name: /Bajo stock crítico/i }).getAttribute('href'))
            .toBe('/reports?tab=inventory&detail=low-stock&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1');
        expect(screen.getByRole('link', { name: /Órdenes abiertas/i }).getAttribute('href'))
            .toBe('/reports?tab=procurement&detail=open-orders&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1');
        expect(screen.getAllByRole('link', { name: /Ver detalle/i }).some((link) =>
            link.getAttribute('href') === '/reports?tab=logistics&detail=transfers&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1'
        )).toBe(true);
        expect(screen.getByRole('link', { name: /Recepciones WMS/i }).getAttribute('href'))
            .toBe('/reports?tab=logistics&detail=receptions&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1');
    });

    it('muestra alertas server-side con severidad y drill-down al reporte', () => {
        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
            />
        );

        expect(screen.getByText('Atención operativa')).toBeTruthy();
        expect(screen.getByText('Cajas abiertas demasiado tiempo')).toBeTruthy();
        expect(screen.getByText('Crítica')).toBeTruthy();
        expect(screen.getAllByText('Transferencias pendientes').length).toBeGreaterThan(0);
        expect(screen.getByText('Advertencia')).toBeTruthy();
        expect(screen.getAllByRole('link', { name: /Ver detalle/i }).some((link) =>
            link.getAttribute('href') === '/reports?tab=cash&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1'
        )).toBe(true);
        expect(screen.getByRole('link', { name: /Revisar caja/i }).getAttribute('href'))
            .toBe('/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1&source=operational-suggestion&alertId=cash-long-open-sessions&tab=cash');
        expect(screen.getAllByRole('link', { name: /Ver detalle/i }).some((link) =>
            link.getAttribute('href') === '/reports?tab=logistics&detail=transfers&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1'
        )).toBe(true);
        expect(screen.getByRole('link', { name: /Ver transferencias/i }).getAttribute('href'))
            .toBe('/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1&source=operational-suggestion&alertId=wms-pending-transfers&tab=logistics&detail=transfers');
    });

    it('muestra insights operacionales read-only sin convertirlos en acciones', () => {
        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
                initialInsights={initialInsights}
            />
        );

        expect(screen.getByText('Qué mirar primero')).toBeTruthy();
        expect(screen.getByText('Resumen ejecutivo')).toBeTruthy();
        expect(screen.getByText('Lo más importante, sin acciones ni enlaces.')).toBeTruthy();
        expect(screen.getByText('Atención principal: Cajas abiertas demasiado tiempo')).toBeTruthy();
        expect(screen.getByText('Fricción principal: Inspeccionar transferencias')).toBeTruthy();
        expect(screen.getByText('Señal útil: Revisar caja abierta')).toBeTruthy();
        expect(screen.getByText(`Sube: ${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} sube de 80% a 100%`)).toBeTruthy();
        expect(screen.getByText('Baja: Fricción baja de 30 a 22')).toBeTruthy();
        expect(screen.getByText('Estable: Valor actual se mantiene en 1')).toBeTruthy();
        expect(screen.getByText('Atención inmediata')).toBeTruthy();
        expect(screen.getByText('Seguimiento recomendado')).toBeTruthy();
        expect(screen.queryByText(/^Señal informativa$/i)).toBeNull();
        expect(screen.getByText('Qué saber del período')).toBeTruthy();
        expect(screen.getByText('Lecturas rápidas')).toBeTruthy();
        expect(screen.getByText('Acción útil: Revisar caja abierta')).toBeTruthy();
        expect(screen.getByText('Revisar: Inspeccionar transferencias')).toBeTruthy();
        expect(screen.getByText('Oportunidad: Cajas abiertas demasiado tiempo')).toBeTruthy();
        expect(screen.getAllByText('Alta').length).toBeGreaterThan(0);
        expect(screen.getAllByText(`${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} 100% · uso visible 50%`).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Fricción 22 · contexto aceptado 20%').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/no ejecuta acciones/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Score/i)).toBeNull();
        expect(screen.queryByText(/Baja señal/i)).toBeNull();
        expect(screen.queryByText(/click rate/i)).toBeNull();
        expect(screen.queryByText(/alta señal de contexto útil/i)).toBeNull();
        expect(screen.queryByRole('link', { name: /Acción útil/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Acción útil/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /Resumen ejecutivo/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Resumen ejecutivo/i })).toBeNull();
    });

    it('compacta señales informativas en un bloque secundario cuando existen', () => {
        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
                initialInsights={insightsWithInformationalSignal}
            />
        );

        expect(screen.getByText('Qué saber')).toBeTruthy();
        expect(screen.getByText('Señal informativa: Bajo stock recurrente')).toBeTruthy();
        expect(screen.getByText('3 apariciones en 7 días')).toBeTruthy();
        expect(screen.getByText('Sube: Sube de 1 a 3 apariciones')).toBeTruthy();
        expect(screen.queryByText(/^Señal informativa$/i)).toBeNull();
    });

    it('no muestra Score aunque venga en títulos, evidencia o métricas de insights', () => {
        const insightsWithInternalScoreCopy: OperationalInsightsResult = {
            success: true,
            data: {
                ...initialInsights.data,
                topUsefulActions: [],
                frictionSignals: [],
                operationalOpportunities: [],
                executiveSummary: [],
                insights: [
                    {
                        ...initialInsights.data.topUsefulActions[0],
                        id: 'insight-with-score-copy',
                        title: 'Score 94: Revisar caja abierta',
                        evidenceLabel: 'Score 94 · click rate 50%',
                        trendDirection: 'flat',
                        trendEvidenceLabel: 'Score 94 · click rate 50%',
                        metrics: [
                            { label: 'Score', value: 94, unit: 'score' },
                            { label: 'Click rate', value: 50, unit: 'percent' },
                        ],
                    },
                ],
            },
        };

        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
                initialInsights={insightsWithInternalScoreCopy}
            />
        );

        expect(screen.getAllByText('Revisar caja abierta').length).toBeGreaterThan(0);
        expect(screen.getAllByText('uso visible 50%').length).toBeGreaterThan(0);
        expect(screen.getByText('Uso visible: 50%')).toBeTruthy();
        expect(screen.queryByText(/Score/i)).toBeNull();
    });

    it('muestra sugerencias sin ejecutar acciones automáticas', () => {
        const emittedEvents: string[] = [];
        const listener = (event: Event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        };
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);

        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={initialSuggestions}
            />
        );

        expect(screen.getAllByText('Sugerencia').length).toBe(2);
        expect(screen.getAllByText(OPERATIONAL_AUTHORITY_LABELS.safePrefill).length).toBe(2);
        expect(screen.getAllByText('Recomendado').length).toBe(2);
        expect(screen.getByText('Revisar caja abierta')).toBeTruthy();
        expect(screen.getByText('Inspeccionar transferencias')).toBeTruthy();
        expect(screen.getByText(/no cierra ni modifica la sesión/i)).toBeTruthy();
        expect(screen.getAllByText(/Alta utilidad: el destino reconoce bien el contexto/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Score 94/i)).toBeNull();
        expect(screen.queryByText(/alta señal de contexto útil/i)).toBeNull();
        expect(screen.getByRole('link', { name: /Revisar caja/i }).getAttribute('href'))
            .toBe('/reports?startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1&source=operational-suggestion&alertId=cash-long-open-sessions&tab=cash');
        fireEvent.click(screen.getByRole('link', { name: /Revisar caja/i }));

        expect(emittedEvents).toContain('quick_action_clicked');
        window.removeEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);
    });

    it('degrada sugerencias suppressed a texto sin CTA principal ni evento de quick action visible', async () => {
        const emittedEvents: string[] = [];
        const listener = (event: Event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        };
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);

        render(
            <AnalyticsDashboard
                initialLocations={[{ id: 'loc-1', name: 'Sucursal 1', type: 'STORE' } as never]}
                userRole="MANAGER"
                initialFilters={{ startDate: '2026-04-19', endDate: '2026-04-19', locationId: 'loc-1', granularity: 'day' }}
                initialOverview={{ success: true, data: overview }}
                initialSuggestions={suggestionsResultWithSuppressed}
            />
        );

        expect(screen.getByText('Inspeccionar transferencias')).toBeTruthy();
        expect(screen.getByText('Revisar después')).toBeTruthy();
        expect(screen.getByText(/Requiere revisión: baja prioridad visual para reducir ruido/i)).toBeTruthy();
        expect(screen.getByText(/Se mantiene como referencia/i)).toBeTruthy();
        expect(screen.queryByText(/señal baja o fricción alta/i)).toBeNull();
        expect(screen.queryByText(/Quick action ocultada/i)).toBeNull();
        expect(screen.queryByRole('link', { name: /Ver transferencias/i })).toBeNull();
        expect(screen.getAllByText(OPERATIONAL_AUTHORITY_LABELS.safePrefill).length).toBe(1);
        expect(screen.getAllByRole('link', { name: /Ver detalle/i }).some((link) =>
            link.getAttribute('href') === '/reports?tab=logistics&detail=transfers&startDate=2026-04-19&endDate=2026-04-19&locationId=loc-1'
        )).toBe(true);

        await waitFor(() => {
            expect(emittedEvents.filter((event) => event === 'suggestion_shown').length).toBe(2);
            expect(emittedEvents.filter((event) => event === 'quick_action_visible').length).toBe(1);
        });
        expect(emittedEvents).not.toContain('quick_action_clicked');

        window.removeEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);
    });
});
