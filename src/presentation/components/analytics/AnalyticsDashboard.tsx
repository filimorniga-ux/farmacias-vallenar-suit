'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Location } from '@/domain/types';
import {
    getOperationalKpiOverviewSecure,
    type OperationalKpiFilters,
    type OperationalKpiOverview,
    type OperationalKpiOverviewResult,
} from '@/actions/analytics/operational-kpis';
import {
    type OperationalAlert,
    type OperationalAlertSeverity,
} from '@/actions/analytics/operational-alerts-model';
import {
    type OperationalSuggestion,
    type OperationalSuggestionsResult,
} from '@/actions/analytics/operational-suggestion-model';
import { getOperationalSuggestionsSecure } from '@/actions/analytics/operational-suggestions';
import {
    type OperationalExecutiveSummaryItem,
    type OperationalInsight,
    type OperationalInsightMetric,
    type OperationalInsightsResult,
} from '@/actions/analytics/operational-insights-model';
import { getOperationalInsightsSecure } from '@/actions/analytics/operational-insights';
import { buildAnalyticsDrilldownHref } from '@/presentation/lib/analytics-report-drilldown';
import { emitOperationalQuickActionUxEvent } from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_AUTHORITY_LABELS,
} from '@/lib/operational-message-catalog';
import {
    AlertTriangle,
    ArrowRight,
    Bell,
    Boxes,
    CheckCircle2,
    ClipboardList,
    Filter,
    Lightbulb,
    PackageCheck,
    Receipt,
    ShoppingCart,
    TrendingUp,
    Truck,
    WalletCards,
} from 'lucide-react';

import ExecutiveDashboard from './ExecutiveDashboard';

interface Props {
    initialLocations: Location[];
    userRole?: string;
    initialFilters: OperationalKpiFilters;
    initialOverview: OperationalKpiOverviewResult;
    initialSuggestions: OperationalSuggestionsResult;
    initialInsights?: OperationalInsightsResult;
}

type FilterState = {
    startDate: string;
    endDate: string;
    locationId: string;
};

const emptyInsightsResult: OperationalInsightsResult = {
    success: true,
    data: {
        scope: {
            startDate: '',
            endDate: '',
            granularity: 'day',
        },
        generatedAt: '',
        signalSource: 'quick-action-tuning-baseline',
        topUsefulActions: [],
        frictionSignals: [],
        operationalOpportunities: [],
        insights: [],
        executiveSummary: [],
        exclusions: [],
    },
};

const fmtMoney = (value: number) =>
    new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    }).format(value);

const fmtNumber = (value: number) =>
    new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(value);

export default function AnalyticsDashboard({
    initialLocations,
    userRole = 'CASHIER',
    initialFilters,
    initialOverview,
    initialSuggestions,
    initialInsights = emptyInsightsResult,
}: Props) {
    const isAdmin = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER'].includes(String(userRole).toUpperCase());
    const [viewMode, setViewMode] = useState<'OPERATIONAL' | 'EXECUTIVE'>('OPERATIONAL');
    const [filters, setFilters] = useState<FilterState>({
        startDate: initialFilters.startDate || '',
        endDate: initialFilters.endDate || '',
        locationId: initialFilters.locationId || '',
    });
    const [overviewResult, setOverviewResult] = useState<OperationalKpiOverviewResult>(initialOverview);
    const [suggestionsResult, setSuggestionsResult] = useState<OperationalSuggestionsResult>(initialSuggestions);
    const [insightsResult, setInsightsResult] = useState<OperationalInsightsResult>(initialInsights);
    const [isPending, startTransition] = useTransition();

    const overview = overviewResult.success ? overviewResult.data : null;
    const drilldownFilters = overview?.scope ?? {
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        locationId: filters.locationId || undefined,
        granularity: 'day',
    };

    const applyFilters = () => {
        const nextFilters: OperationalKpiFilters = {
            startDate: filters.startDate,
            endDate: filters.endDate,
            locationId: filters.locationId || undefined,
            granularity: 'day',
        };

        startTransition(() => {
            void Promise.all([
                getOperationalKpiOverviewSecure(nextFilters),
                getOperationalSuggestionsSecure(nextFilters),
                getOperationalInsightsSecure(nextFilters),
            ]).then(([nextOverview, nextSuggestions, nextInsights]) => {
                setOverviewResult(nextOverview);
                setSuggestionsResult(nextSuggestions);
                setInsightsResult(nextInsights);
            });
        });
    };

    return (
        <div className="space-y-6">
            {isAdmin && (
                <div className="flex justify-end">
                    <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm">
                        <button
                            onClick={() => setViewMode('OPERATIONAL')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewMode === 'OPERATIONAL'
                                ? 'bg-sky-100 text-sky-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Operativo
                        </button>
                        <button
                            onClick={() => setViewMode('EXECUTIVE')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewMode === 'EXECUTIVE'
                                ? 'bg-sky-100 text-sky-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Gerencial
                        </button>
                    </div>
                </div>
            )}

            {viewMode === 'EXECUTIVE' ? (
                <ExecutiveDashboard />
            ) : (
                <>
                    <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                        <div className="flex items-center gap-2 text-slate-500 mr-2">
                            <Filter size={20} />
                            <span className="font-semibold">Filtros</span>
                        </div>

                        <label className="block">
                            <span className="block text-xs font-medium text-slate-500 mb-1">Desde</span>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                                className="p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                            />
                        </label>

                        <label className="block">
                            <span className="block text-xs font-medium text-slate-500 mb-1">Hasta</span>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                                className="p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                            />
                        </label>

                        <label className="block">
                            <span className="block text-xs font-medium text-slate-500 mb-1">Sucursal</span>
                            <select
                                value={filters.locationId}
                                onChange={(event) => setFilters((prev) => ({ ...prev, locationId: event.target.value }))}
                                className="p-2 border border-slate-200 rounded-lg text-sm min-w-[180px] focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                                <option value="">Todas las sucursales</option>
                                {initialLocations.map((location) => (
                                    <option key={location.id} value={location.id}>{location.name}</option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            onClick={applyFilters}
                            disabled={isPending}
                            className="px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-60 transition-colors"
                        >
                            {isPending ? 'Actualizando...' : 'Aplicar filtros'}
                        </button>

                        <Link
                            href={buildAnalyticsDrilldownHref('reports-overview', drilldownFilters)}
                            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            Ver reportes
                            <ArrowRight size={16} />
                        </Link>
                    </section>

                    {!overview && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm">
                            {overviewResult.success ? 'Sin datos para el período seleccionado.' : overviewResult.error}
                        </div>
                    )}

                    {overview && (
                        <>
                            <OperationalInsightsPanel insightsResult={insightsResult} />
                            <OperationalAlertsPanel suggestionsResult={suggestionsResult} />

                            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <KPICard
                                    title="Ventas netas"
                                    value={fmtMoney(overview.sales.netSales)}
                                    sub={`${fmtNumber(overview.sales.ticketCount)} tickets`}
                                    icon={<TrendingUp className="text-emerald-600" />}
                                    tone="emerald"
                                    href={buildAnalyticsDrilldownHref('sales-products', drilldownFilters)}
                                />
                                <KPICard
                                    title="Ticket promedio"
                                    value={fmtMoney(overview.sales.averageTicket)}
                                    sub="Solo ventas completadas"
                                    icon={<Receipt className="text-sky-600" />}
                                    tone="sky"
                                    href={buildAnalyticsDrilldownHref('sales-products', drilldownFilters)}
                                />
                                <KPICard
                                    title="Cajas abiertas"
                                    value={fmtNumber(overview.cash.openSessions)}
                                    sub={`${fmtNumber(overview.cash.longOpenSessions)} abiertas > 12h`}
                                    icon={<WalletCards className="text-cyan-600" />}
                                    tone="cyan"
                                    href={buildAnalyticsDrilldownHref('cash', drilldownFilters)}
                                />
                                <KPICard
                                    title="Bajo stock crítico"
                                    value={fmtNumber(overview.inventory.criticalLowStockCount)}
                                    sub="Snapshot server-side"
                                    icon={<AlertTriangle className="text-amber-600" />}
                                    tone="amber"
                                    href={buildAnalyticsDrilldownHref('inventory-low-stock', drilldownFilters)}
                                />
                            </section>

                            <OperationalSupportPanel overview={overview} drilldownFilters={drilldownFilters} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function OperationalAlertsPanel({ suggestionsResult }: { suggestionsResult: OperationalSuggestionsResult }) {
    useEffect(() => {
        if (!suggestionsResult.success) return;

        suggestionsResult.data.suggestions.forEach((suggestion) => {
            const alert = suggestionsResult.data.suggestionsByAlertId[suggestion.alertId]
                ? suggestionsResult.data.alerts.find((item) => item.id === suggestion.alertId)
                : undefined;
            const filters = alert?.drilldown.filters;

            emitOperationalQuickActionUxEvent({
                event: 'suggestion_shown',
                alertId: suggestion.alertId,
                suggestionId: suggestion.id,
                targetModule: suggestion.targetModule,
                actionMode: suggestion.actionMode,
                destination: suggestion.href.split('?')[0],
                hasDateRange: Boolean(filters?.startDate && filters?.endDate),
                hasLocationId: Boolean(filters?.locationId),
                hasWarehouseId: Boolean(filters?.warehouseId),
            });
            if (isPrimaryQuickActionSuggestion(suggestion)) {
                emitOperationalQuickActionUxEvent({
                    event: 'quick_action_visible',
                    alertId: suggestion.alertId,
                    suggestionId: suggestion.id,
                    targetModule: suggestion.targetModule,
                    actionMode: suggestion.actionMode,
                    destination: suggestion.href.split('?')[0],
                    hasDateRange: Boolean(filters?.startDate && filters?.endDate),
                    hasLocationId: Boolean(filters?.locationId),
                    hasWarehouseId: Boolean(filters?.warehouseId),
                });
            }
        });
    }, [suggestionsResult]);

    if (!suggestionsResult.success) {
        return (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                {suggestionsResult.error}
            </section>
        );
    }

    const { alerts, suggestionsByAlertId } = suggestionsResult.data;

    if (alerts.length === 0) {
        return (
            <section className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white shadow-sm">
                    <CheckCircle2 className="text-emerald-600" size={20} />
                </div>
                <div>
                    <h2 className="font-bold text-emerald-950">Sin alertas operativas activas</h2>
                    <p className="text-sm text-emerald-700">El contexto seleccionado no tiene desvíos sobre contratos ready.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2">
                        <Bell size={18} />
                        Atención operativa
                    </h2>
                    <p className="text-sm text-slate-500">Desvíos activos calculados en servidor.</p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-3 py-1">
                    {fmtNumber(alerts.length)} activas
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {alerts.map((alert) => (
                    <OperationalAlertCard
                        key={alert.id}
                        alert={alert}
                        suggestion={suggestionsByAlertId[alert.id]}
                    />
                ))}
            </div>
        </section>
    );
}

function OperationalInsightsPanel({ insightsResult }: { insightsResult: OperationalInsightsResult }) {
    if (!insightsResult.success) {
        return (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                {insightsResult.error}
            </section>
        );
    }

    const {
        topUsefulActions,
        frictionSignals,
        operationalOpportunities,
        insights,
        executiveSummary,
    } = insightsResult.data;
    const allInsights = insights.length > 0
        ? insights
        : [...topUsefulActions, ...frictionSignals, ...operationalOpportunities];
    const immediateInsights = allInsights.filter((insight) => insight.priority === 'high');
    const followUpInsights = allInsights.filter((insight) => insight.priority === 'medium');
    const informationalInsights = allInsights.filter((insight) => insight.priority === 'low');
    const hasInsights = allInsights.length > 0;
    const hasInformationalInsights = informationalInsights.length > 0;

    if (!hasInsights) {
        return (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-sky-50">
                        <Lightbulb className="text-sky-600" size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900">Sin insights operacionales activos</h2>
                        <p className="text-sm text-slate-500">No hay señales suficientes para explicar desvíos en el contexto seleccionado.</p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2">
                        <Lightbulb size={18} />
                        Qué mirar primero
                    </h2>
                    <p className="text-sm text-slate-500">
                        Prioridad y seguimiento, sin ejecutar acciones.
                    </p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-3 py-1">
                    Lectura segura
                </span>
            </div>

            {executiveSummary.length > 0 && (
                <ExecutiveSummaryList items={executiveSummary} />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <InsightGroup
                    title="Atención inmediata"
                    emptyLabel="Sin señales urgentes."
                    insights={immediateInsights}
                />
                <InsightGroup
                    title="Seguimiento recomendado"
                    emptyLabel="Sin seguimiento pendiente."
                    insights={followUpInsights}
                />
            </div>

            {hasInformationalInsights && (
                <InformationalInsightStrip insights={informationalInsights} />
            )}
        </section>
    );
}

function ExecutiveSummaryList({ items }: { items: OperationalExecutiveSummaryItem[] }) {
    return (
        <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">Resumen ejecutivo</h3>
                    <p className="text-xs text-slate-600">Lo más importante, sin acciones ni enlaces.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700">
                    Read-only
                </span>
            </div>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
                {items.map((item) => {
                    const styles = summaryTypeStyles[item.summaryType];
                    return (
                        <article key={item.id} className={`rounded-xl border bg-white p-3 ${styles.border}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles.badge}`}>
                                    {styles.label}
                                </span>
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    {insightSeverityStyles[item.severity].label}
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-950">{item.headline}</p>
                            <p className="mt-2 text-xs text-slate-500">{formatOperationalEvidenceLabel(item.supportingEvidence)}</p>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

function InformationalInsightStrip({ insights }: { insights: OperationalInsight[] }) {
    return (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Qué saber</h3>
                    <p className="text-xs text-slate-500">Señales secundarias para revisar después.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    {fmtNumber(insights.length)} señales
                </span>
            </div>

            <div className="mt-3 space-y-2">
                {insights.map((insight) => (
                    <CompactInformationalInsightCard key={insight.id} insight={insight} />
                ))}
            </div>
        </div>
    );
}

function CompactInformationalInsightCard({ insight }: { insight: OperationalInsight }) {
    const styles = insightSeverityStyles[insight.severity];
    const trendStyles = insightTrendStyles[insight.trendDirection];

    return (
        <article className="rounded-xl border border-slate-100 bg-white/90 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h4 className="text-sm font-semibold text-slate-900">{formatOperationalInsightTitle(insight.title)}</h4>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {formatOperationalEvidenceLabel(insight.evidenceLabel)}
                    </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${styles.badge}`}>
                    {insightKindLabels[insight.kind]}
                </span>
            </div>
            {insight.trendDirection !== 'unavailable' && (
                <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${trendStyles.badge}`}>
                    {trendStyles.label}: {formatOperationalEvidenceLabel(insight.trendEvidenceLabel)}
                </p>
            )}
        </article>
    );
}

function InsightGroup({
    title,
    emptyLabel,
    insights,
}: {
    title: string;
    emptyLabel: string;
    insights: OperationalInsight[];
}) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            {insights.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">{emptyLabel}</p>
            ) : (
                <div className="mt-3 space-y-3">
                    {insights.map((insight) => (
                        <InsightCard key={insight.id} insight={insight} />
                    ))}
                </div>
            )}
        </div>
    );
}

function InsightCard({ insight }: { insight: OperationalInsight }) {
    const styles = insightSeverityStyles[insight.severity];
    const priorityStyles = insightPriorityStyles[insight.priority];
    const trendStyles = insightTrendStyles[insight.trendDirection];
    const visibleMetrics = getVisibleInsightMetrics(insight);

    return (
        <article className={`rounded-xl border p-3 ${styles.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${priorityStyles.badge}`}>
                        {priorityStyles.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles.badge}`}>
                        {insightKindLabels[insight.kind]}
                    </span>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {insight.owner}
                </span>
            </div>
            <h4 className="mt-2 font-bold text-sm text-slate-950">{formatOperationalInsightTitle(insight.title)}</h4>
            <p className="mt-1 text-xs text-slate-600">{insight.description}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{insight.reason}</p>
            {insight.trendDirection !== 'unavailable' && (
                <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-bold ${trendStyles.badge}`}>
                    {trendStyles.label}: {formatOperationalEvidenceLabel(insight.trendEvidenceLabel)}
                </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700">
                    {formatOperationalEvidenceLabel(insight.evidenceLabel)}
                </span>
                {visibleMetrics.map((metric) => (
                    <span key={metric.key} className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {metric.label}: {metric.value}
                    </span>
                ))}
            </div>
        </article>
    );
}

function OperationalSupportPanel({
    overview,
    drilldownFilters,
}: {
    overview: OperationalKpiOverview;
    drilldownFilters: OperationalKpiFilters;
}) {
    return (
        <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Qué saber del período</h2>
                    <p className="text-xs text-slate-500">Contexto adicional para revisar después de prioridades y seguimiento.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    Soporte
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_320px] gap-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Panel
                        title="Top productos vendidos"
                        icon={<ShoppingCart size={18} />}
                        href={buildAnalyticsDrilldownHref('sales-products', drilldownFilters)}
                        compact
                    >
                        {overview.sales.topProducts.length === 0 ? (
                            <EmptyState label="Sin ventas de productos en este período." />
                        ) : (
                            <div className="space-y-3">
                                {overview.sales.topProducts.map((product) => (
                                    <div key={product.productId} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                        <div>
                                            <p className="font-semibold text-slate-800">{product.name}</p>
                                            <p className="text-xs text-slate-500">{product.sku || 'Sin SKU'} · {fmtNumber(product.unitsSold)} unidades</p>
                                        </div>
                                        <p className="font-mono text-sm font-semibold text-slate-700">{fmtMoney(product.totalAmount)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    <Panel
                        title="Stock crítico"
                        icon={<Boxes size={18} />}
                        href={buildAnalyticsDrilldownHref('inventory-low-stock', drilldownFilters)}
                        compact
                    >
                        {overview.inventory.criticalItems.length === 0 ? (
                            <EmptyState label="Sin quiebres críticos para el contexto seleccionado." />
                        ) : (
                            <div className="space-y-3">
                                {overview.inventory.criticalItems.map((item) => (
                                    <div key={`${item.productId}-${item.warehouseId || 'global'}`} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                        <div>
                                            <p className="font-semibold text-slate-800">{item.name}</p>
                                            <p className="text-xs text-slate-500">{item.sku || 'Sin SKU'} · mínimo {fmtNumber(item.stockMin)}</p>
                                        </div>
                                        <p className="text-sm font-bold text-amber-700">{fmtNumber(item.quantity)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                <aside className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white/85 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Lecturas rápidas</h3>
                            <span className="text-[11px] font-semibold text-slate-400">Apoyo</span>
                        </div>
                        <div className="mt-3 space-y-2">
                            <CompactMetric
                                icon={<ClipboardList size={16} />}
                                label="Órdenes abiertas"
                                value={overview.procurement.openPurchaseOrders}
                                helper="Backlog de compras no cerrado"
                                href={buildAnalyticsDrilldownHref('procurement-orders', drilldownFilters)}
                            />
                            <CompactMetric
                                icon={<Truck size={16} />}
                                label="Transferencias pendientes"
                                value={overview.wms.pendingTransfers}
                                helper="Shipments inter-sucursal activos"
                                href={buildAnalyticsDrilldownHref('wms-transfers', drilldownFilters)}
                            />
                            <CompactMetric
                                icon={<PackageCheck size={16} />}
                                label="Recepciones WMS"
                                value={overview.wms.pendingInboundShipments}
                                helper="Ingresos físicos aún pendientes"
                                href={buildAnalyticsDrilldownHref('wms-receptions', drilldownFilters)}
                            />
                        </div>
                    </div>

                    <section className="bg-white/75 border border-slate-200 text-slate-600 rounded-xl px-3 py-3 flex flex-col gap-2">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Datos confiables</h3>
                            <p className="mt-1 text-[11px] text-slate-500">
                                Solo KPIs listos para operación; las métricas condicionadas quedan fuera.
                            </p>
                        </div>
                        <Link
                            href={buildAnalyticsDrilldownHref('reports-overview', drilldownFilters)}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                            Ver reportes
                            <ArrowRight size={14} />
                        </Link>
                    </section>
                </aside>
            </div>
        </section>
    );
}

function formatOperationalEvidenceLabel(label: string) {
    return label
        .replace(/\bScore\s+[\d.,]+\s*·\s*/gi, '')
        .replace(/\s*·\s*\bScore\s+[\d.,]+/gi, '')
        .replace(/\bScore\s+[\d.,]+\b/gi, 'Señal interna')
        .replace(/\bclick rate\b/gi, 'uso visible')
        .replace(/\bScore\b/gi, 'Señal interna')
        .trim();
}

function formatOperationalInsightTitle(title: string) {
    return title
        .replace(/\bScore\s+[\d.,]+\s*:\s*/gi, '')
        .replace(/\bScore\s+[\d.,]+\b/gi, '')
        .replace(/\bScore\b/gi, 'Señal interna')
        .replace(/^Baja señal:/i, 'Revisar:')
        .trim();
}

function getVisibleInsightMetrics(insight: OperationalInsight) {
    return insight.metrics
        .map((metric) => {
            const label = formatInsightMetricLabel(metric.label);
            if (!label) return null;

            return {
                key: `${insight.id}-${metric.label}`,
                label,
                value: formatInsightMetric(metric),
            };
        })
        .filter((metric): metric is { key: string; label: string; value: string } => Boolean(metric));
}

function formatInsightMetricLabel(label: string) {
    const normalized = label.trim().toLowerCase();
    if (normalized === 'score') return null;
    if (normalized === 'click rate') return 'Uso visible';
    if (normalized === 'fricción') return 'Fricción operativa';
    return label;
}

function formatInsightMetric(metric: OperationalInsightMetric) {
    if (metric.unit === 'percent') {
        return `${fmtNumber(metric.value)}%`;
    }
    return fmtNumber(metric.value);
}

function OperationalAlertCard({
    alert,
    suggestion,
}: {
    alert: OperationalAlert;
    suggestion?: OperationalSuggestion;
}) {
    const styles = alertSeverityStyles[alert.severity];
    const showPrimaryQuickAction = suggestion ? isPrimaryQuickActionSuggestion(suggestion) : false;

    return (
        <div className={`rounded-2xl border p-4 ${styles.card}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${styles.badge}`}>
                        {styles.label}
                    </span>
                    <h3 className="font-bold text-slate-950 mt-3">{alert.name}</h3>
                    <p className="text-sm text-slate-600 mt-1">{alert.definition}</p>
                </div>
                <Link
                    href={buildAnalyticsDrilldownHref(alert.drilldown.target, alert.drilldown.filters)}
                    className={`inline-flex items-center gap-1 text-xs font-bold ${styles.icon}`}
                >
                    Ver detalle
                    <ArrowRight size={14} />
                </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="bg-white/80 rounded-full px-2.5 py-1 font-semibold">Valor: {fmtNumber(alert.value)}</span>
                <span className="bg-white/80 rounded-full px-2.5 py-1 font-semibold">{alert.threshold}</span>
                <span className="bg-white/80 rounded-full px-2.5 py-1 font-semibold">{alert.owner}</span>
            </div>

            {suggestion && (
                <div className="mt-4 rounded-xl bg-white/80 border border-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sugerencia</p>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${suggestionQualityClasses[suggestion.qualityTier]}`}>
                                {suggestionQualityLabels[suggestion.qualityTier]}
                            </span>
                            {showPrimaryQuickAction && (
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${quickActionModeClasses[suggestion.actionMode]}`}>
                                    {quickActionModeLabels[suggestion.actionMode]}
                                </span>
                            )}
                        </div>
                    </div>
                    <h4 className="font-bold text-slate-900 mt-2">{suggestion.title}</h4>
                    <p className="text-sm text-slate-600 mt-1">{suggestion.description}</p>
                    <p className="text-xs text-slate-500 mt-2">{suggestion.safeBecause}</p>
                    <p className="text-xs text-slate-400 mt-1">
                        {formatSuggestionQualityCopy(suggestion)}
                    </p>
                    {showPrimaryQuickAction ? (
                        <Link
                            href={suggestion.href}
                            onClick={() => emitOperationalQuickActionUxEvent({
                                event: 'quick_action_clicked',
                                alertId: suggestion.alertId,
                                suggestionId: suggestion.id,
                                targetModule: suggestion.targetModule,
                                actionMode: suggestion.actionMode,
                                destination: suggestion.href.split('?')[0],
                                hasDateRange: Boolean(alert.drilldown.filters.startDate && alert.drilldown.filters.endDate),
                                hasLocationId: Boolean(alert.drilldown.filters.locationId),
                                hasWarehouseId: Boolean(alert.drilldown.filters.warehouseId),
                            })}
                            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-sky-700 hover:text-sky-800"
                        >
                            {suggestion.actionLabel}
                            <ArrowRight size={14} />
                        </Link>
                    ) : (
                        <p className="mt-3 text-xs font-semibold text-amber-700">
                            Se mantiene como referencia. Usa el detalle de la alerta si necesitas revisar el caso.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function isPrimaryQuickActionSuggestion(suggestion: OperationalSuggestion) {
    return suggestion.qualityTier !== 'suppressed';
}

function formatSuggestionQualityCopy(suggestion: OperationalSuggestion) {
    if (suggestion.qualityTier === 'recommended') {
        return 'Alta utilidad: el destino reconoce bien el contexto.';
    }
    if (suggestion.qualityTier === 'standard') {
        return 'Utilidad estable: mantiene el contexto visible sin automatizar.';
    }
    return 'Requiere revisión: baja prioridad visual para reducir ruido.';
}

const quickActionModeLabels = {
    'prefill-safe': OPERATIONAL_AUTHORITY_LABELS.safePrefill,
    'navigate-only': 'Solo navegación',
    'not-allowed-yet': 'Bloqueada',
};

const quickActionModeClasses = {
    'prefill-safe': 'bg-emerald-100 text-emerald-700',
    'navigate-only': 'bg-slate-100 text-slate-600',
    'not-allowed-yet': 'bg-rose-100 text-rose-700',
};

const suggestionQualityLabels = {
    recommended: 'Recomendado',
    standard: 'Útil',
    suppressed: 'Revisar después',
};

const suggestionQualityClasses = {
    recommended: 'bg-sky-100 text-sky-700',
    standard: 'bg-slate-100 text-slate-600',
    suppressed: 'bg-amber-100 text-amber-700',
};

const insightSeverityStyles: Record<'info' | 'warning' | 'critical', {
    label: string;
    card: string;
    badge: string;
}> = {
    info: {
        label: 'Lectura',
        card: 'bg-white border-sky-100',
        badge: 'bg-sky-100 text-sky-700',
    },
    warning: {
        label: 'Revisar',
        card: 'bg-white border-amber-100',
        badge: 'bg-amber-100 text-amber-700',
    },
    critical: {
        label: 'Prioridad',
        card: 'bg-white border-rose-100',
        badge: 'bg-rose-100 text-rose-700',
    },
};

const insightPriorityStyles = {
    high: {
        label: 'Alta',
        badge: 'bg-rose-100 text-rose-700',
    },
    medium: {
        label: 'Media',
        badge: 'bg-amber-100 text-amber-700',
    },
    low: {
        label: 'Baja',
        badge: 'bg-slate-100 text-slate-600',
    },
};

const insightKindLabels = {
    'quick-action-value': 'Valor',
    'quick-action-friction': 'Fricción',
    'operational-opportunity': 'Oportunidad',
};

const insightTrendStyles = {
    up: {
        label: 'Sube',
        badge: 'bg-emerald-50 text-emerald-700',
    },
    down: {
        label: 'Baja',
        badge: 'bg-sky-50 text-sky-700',
    },
    flat: {
        label: 'Estable',
        badge: 'bg-slate-100 text-slate-600',
    },
    unavailable: {
        label: 'Sin tendencia',
        badge: 'bg-slate-100 text-slate-500',
    },
};

const summaryTypeStyles = {
    attention: {
        label: 'Atención',
        border: 'border-rose-100',
        badge: 'bg-rose-100 text-rose-700',
    },
    friction: {
        label: 'Fricción',
        border: 'border-amber-100',
        badge: 'bg-amber-100 text-amber-700',
    },
    opportunity: {
        label: 'Señal útil',
        border: 'border-sky-100',
        badge: 'bg-sky-100 text-sky-700',
    },
};

const alertSeverityStyles: Record<OperationalAlertSeverity, {
    label: string;
    card: string;
    badge: string;
    icon: string;
}> = {
    critical: {
        label: 'Crítica',
        card: 'bg-rose-50 border-rose-100',
        badge: 'bg-rose-100 text-rose-700',
        icon: 'text-rose-600',
    },
    warning: {
        label: 'Advertencia',
        card: 'bg-amber-50 border-amber-100',
        badge: 'bg-amber-100 text-amber-700',
        icon: 'text-amber-600',
    },
    info: {
        label: 'Informativa',
        card: 'bg-sky-50 border-sky-100',
        badge: 'bg-sky-100 text-sky-700',
        icon: 'text-sky-600',
    },
};

function KPICard({
    title,
    value,
    sub,
    icon,
    tone,
    href,
}: {
    title: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    tone: 'emerald' | 'sky' | 'cyan' | 'amber';
    href: string;
}) {
    const toneClasses = {
        emerald: 'bg-emerald-50 border-emerald-100',
        sky: 'bg-sky-50 border-sky-100',
        cyan: 'bg-cyan-50 border-cyan-100',
        amber: 'bg-amber-50 border-amber-100',
    }[tone];

    return (
        <Link href={href} className={`block p-4 rounded-xl border ${toneClasses} hover:shadow-sm transition-shadow`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-slate-600">{title}</p>
                    <p className="text-xl font-bold text-slate-950 mt-1.5">{value}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/80 shadow-sm">{icon}</div>
            </div>
        </Link>
    );
}

function CompactMetric({
    icon,
    label,
    value,
    helper,
    href,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    helper: string;
    href: string;
}) {
    return (
        <Link href={href} className="block rounded-xl border border-slate-200 bg-white px-3 py-3 hover:border-slate-300 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-950 mt-2">{fmtNumber(value)}</p>
            <p className="text-[11px] text-slate-500 mt-1">{helper}</p>
        </Link>
    );
}

function Panel({
    title,
    icon,
    children,
    href,
    compact,
}: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    href?: string;
    compact?: boolean;
}) {
    return (
        <div className={`bg-white border border-slate-200 ${compact ? 'p-4 rounded-xl' : 'p-5 rounded-2xl shadow-sm'}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    {icon}
                    {title}
                </h3>
                {href && (
                    <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800">
                        Ver detalle
                        <ArrowRight size={14} />
                    </Link>
                )}
            </div>
            {children}
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="border border-dashed border-slate-200 rounded-xl p-5 text-sm text-slate-500 text-center">
            {label}
        </div>
    );
}
