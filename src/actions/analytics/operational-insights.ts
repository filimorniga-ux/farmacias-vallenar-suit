'use server';

import type { OperationalKpiFilters } from './operational-kpis';
import {
    getOperationalSuggestionsSecure,
} from './operational-suggestions';
import { OPERATIONAL_CONTEXT_STATUS_LABELS } from '@/lib/operational-message-catalog';
import {
    OPERATIONAL_INSIGHT_EXCLUSIONS,
    type OperationalExecutiveSummaryItem,
    type OperationalInsight,
    type OperationalInsightMetric,
    type OperationalInsightPriority,
    type OperationalInsightTrendDirection,
    type OperationalInsightsResult,
} from './operational-insights-model';
import type { OperationalAlert } from './operational-alerts-model';
import type { OperationalSuggestion, OperationalSuggestionsPayload } from './operational-suggestion-model';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_TREND = {
    trendDirection: 'unavailable' as const,
    trendWindow: 'Sin ventana previa comparable',
    trendEvidenceLabel: 'Sin base temporal suficiente',
};

function rateMetric(label: string, value: number): OperationalInsightMetric {
    return { label, value: Math.round(value * 100), unit: 'percent' };
}

function scoreMetric(label: string, value: number): OperationalInsightMetric {
    return { label, value: Math.round(value), unit: 'score' };
}

function countMetric(label: string, value: number): OperationalInsightMetric {
    return { label, value: Math.round(value), unit: 'count' };
}

function percentLabel(value: number) {
    return `${Math.round(value * 100)}%`;
}

function dateInputFromUtc(date: Date) {
    return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function derivePreviousWindow(scope: OperationalSuggestionsPayload['scope']): OperationalKpiFilters | null {
    const start = parseDateInput(scope.startDate);
    const end = parseDateInput(scope.endDate);
    if (!start || !end || start > end) {
        return null;
    }

    const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_IN_MS) + 1);
    const previousEnd = new Date(start.getTime() - DAY_IN_MS);
    const previousStart = new Date(previousEnd.getTime() - ((windowDays - 1) * DAY_IN_MS));

    return {
        startDate: dateInputFromUtc(previousStart),
        endDate: dateInputFromUtc(previousEnd),
        locationId: scope.locationId,
        warehouseId: scope.warehouseId,
        granularity: scope.granularity,
    };
}

function trendWindowLabel(
    currentScope: OperationalSuggestionsPayload['scope'],
    previousFilters: OperationalKpiFilters,
) {
    return `${currentScope.startDate} a ${currentScope.endDate} vs ${previousFilters.startDate} a ${previousFilters.endDate}`;
}

function priorityForUsefulAction(suggestion: OperationalSuggestion): OperationalInsightPriority {
    if (suggestion.contextAcceptedRate >= 0.8 && suggestion.clickRate >= 0.5) {
        return 'high';
    }
    if (suggestion.contextAcceptedRate >= 0.6 || suggestion.score >= 65) {
        return 'medium';
    }
    return 'low';
}

function priorityForFriction(suggestion: OperationalSuggestion): OperationalInsightPriority {
    if (suggestion.qualityTier === 'suppressed' || suggestion.friction >= 25 || suggestion.contextAcceptedRate < 0.35) {
        return 'high';
    }
    if (suggestion.friction >= 18 || suggestion.contextAcceptedRate < 0.5) {
        return 'medium';
    }
    return 'low';
}

function priorityForOpportunity(alert: OperationalAlert): OperationalInsightPriority {
    if (alert.severity === 'critical') {
        return 'high';
    }
    if (alert.severity === 'warning') {
        return 'medium';
    }
    return 'low';
}

function stripInsightPrefix(title: string) {
    return title.replace(/^(Acción útil|Baja señal|Oportunidad):\s*/u, '');
}

function formatMetricValue(metric: OperationalInsightMetric, value: number) {
    if (metric.unit === 'percent') {
        return `${Math.round(value)}%`;
    }
    return String(Math.round(value));
}

function metricForTrend(insight: OperationalInsight) {
    if (insight.kind === 'quick-action-value') {
        return insight.metrics.find((metric) => metric.label === OPERATIONAL_CONTEXT_STATUS_LABELS.accepted);
    }
    if (insight.kind === 'quick-action-friction') {
        return insight.metrics.find((metric) => metric.label === 'Fricción');
    }
    return insight.metrics.find((metric) => metric.label === 'Valor actual');
}

function insightTrendKey(insight: OperationalInsight) {
    if (insight.suggestionId) {
        return `${insight.kind}:${insight.suggestionId}`;
    }
    if (insight.alertId) {
        return `${insight.kind}:${insight.alertId}`;
    }
    return insight.id;
}

function directionFromDelta(delta: number): OperationalInsightTrendDirection {
    if (Math.abs(delta) < 1) {
        return 'flat';
    }
    return delta > 0 ? 'up' : 'down';
}

function applyTrendComparisons({
    currentInsights,
    previousInsights,
    trendWindow,
}: {
    currentInsights: OperationalInsight[];
    previousInsights: OperationalInsight[];
    trendWindow: string;
}) {
    const previousByKey = new Map(previousInsights.map((insight) => [insightTrendKey(insight), insight]));

    return currentInsights.map((insight) => {
        const currentMetric = metricForTrend(insight);
        const previousInsight = previousByKey.get(insightTrendKey(insight));
        const previousMetric = previousInsight ? metricForTrend(previousInsight) : undefined;

        if (!currentMetric || !previousMetric) {
            return {
                ...insight,
                ...UNAVAILABLE_TREND,
            };
        }

        const direction = directionFromDelta(currentMetric.value - previousMetric.value);
        const trendVerb = direction === 'flat'
            ? 'se mantiene en'
            : direction === 'up'
                ? 'sube de'
                : 'baja de';
        const trendEvidenceLabel = direction === 'flat'
            ? `${currentMetric.label} ${trendVerb} ${formatMetricValue(currentMetric, currentMetric.value)}`
            : `${currentMetric.label} ${trendVerb} ${formatMetricValue(currentMetric, previousMetric.value)} a ${formatMetricValue(currentMetric, currentMetric.value)}`;

        return {
            ...insight,
            trendDirection: direction,
            trendWindow,
            trendEvidenceLabel,
        };
    });
}

function buildExecutiveSummary({
    topUsefulActions,
    frictionSignals,
    operationalOpportunities,
}: {
    topUsefulActions: OperationalInsight[];
    frictionSignals: OperationalInsight[];
    operationalOpportunities: OperationalInsight[];
}): OperationalExecutiveSummaryItem[] {
    const summary: OperationalExecutiveSummaryItem[] = [];
    const primaryAttention = operationalOpportunities.find((insight) => insight.priority === 'high')
        ?? operationalOpportunities.find((insight) => insight.priority === 'medium');
    const primaryFriction = frictionSignals.find((insight) => insight.priority === 'high')
        ?? frictionSignals.find((insight) => insight.priority === 'medium');
    const primaryOpportunity = topUsefulActions.find((insight) => insight.priority === 'high')
        ?? topUsefulActions.find((insight) => insight.priority === 'medium');

    if (primaryAttention) {
        summary.push({
            id: `summary-attention-${primaryAttention.id}`,
            headline: `Atención principal: ${stripInsightPrefix(primaryAttention.title)}`,
            severity: primaryAttention.severity,
            summaryType: 'attention',
            supportingEvidence: primaryAttention.evidenceLabel,
            sourceInsightId: primaryAttention.id,
        });
    }

    if (primaryFriction) {
        summary.push({
            id: `summary-friction-${primaryFriction.id}`,
            headline: `Fricción principal: ${stripInsightPrefix(primaryFriction.title)}`,
            severity: primaryFriction.severity,
            summaryType: 'friction',
            supportingEvidence: primaryFriction.evidenceLabel,
            sourceInsightId: primaryFriction.id,
        });
    }

    if (primaryOpportunity) {
        summary.push({
            id: `summary-opportunity-${primaryOpportunity.id}`,
            headline: `Señal útil: ${stripInsightPrefix(primaryOpportunity.title)}`,
            severity: primaryOpportunity.severity,
            summaryType: 'opportunity',
            supportingEvidence: primaryOpportunity.evidenceLabel,
            sourceInsightId: primaryOpportunity.id,
        });
    }

    return summary;
}

function buildTopUsefulActions(suggestions: OperationalSuggestion[]): OperationalInsight[] {
    return suggestions
        .filter((suggestion) => suggestion.qualityTier !== 'suppressed')
        .sort((left, right) => {
            if (right.contextAcceptedRate !== left.contextAcceptedRate) {
                return right.contextAcceptedRate - left.contextAcceptedRate;
            }
            if (right.clickRate !== left.clickRate) {
                return right.clickRate - left.clickRate;
            }
            return right.score - left.score;
        })
        .slice(0, 3)
        .map((suggestion) => ({
            id: `value-${suggestion.id}`,
            title: `Acción útil: ${suggestion.title}`,
            description: 'Mantener visible: la señal actual indica buena adopción y contexto reconocido.',
            kind: 'quick-action-value',
            priority: priorityForUsefulAction(suggestion),
            severity: 'info',
            owner: suggestion.owner,
            source: suggestion.source,
            signal: suggestion.tuningReason,
            reason: 'La acción muestra buena adopción y el destino reconoce el contexto heredado.',
            evidenceLabel: `${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted} ${percentLabel(suggestion.contextAcceptedRate)} · click rate ${percentLabel(suggestion.clickRate)}`,
            ...UNAVAILABLE_TREND,
            suggestionId: suggestion.id,
            alertId: suggestion.alertId,
            metrics: [
                rateMetric('Click rate', suggestion.clickRate),
                rateMetric(OPERATIONAL_CONTEXT_STATUS_LABELS.accepted, suggestion.contextAcceptedRate),
                scoreMetric('Score', suggestion.score),
            ],
        }));
}

function buildFrictionSignals(suggestions: OperationalSuggestion[]): OperationalInsight[] {
    return suggestions
        .filter((suggestion) =>
            suggestion.qualityTier === 'suppressed'
            || suggestion.friction >= 18
            || suggestion.contextAcceptedRate < 0.5
        )
        .sort((left, right) => {
            if (right.friction !== left.friction) {
                return right.friction - left.friction;
            }
            return left.contextAcceptedRate - right.contextAcceptedRate;
        })
        .slice(0, 3)
        .map((suggestion) => ({
            id: `friction-${suggestion.id}`,
            title: `Baja señal: ${suggestion.title}`,
            description: 'Reducir ruido: conviene mantenerla textual o revisar el handoff antes de promoverla.',
            kind: 'quick-action-friction',
            priority: priorityForFriction(suggestion),
            severity: 'warning',
            owner: suggestion.owner,
            source: suggestion.source,
            signal: suggestion.tuningReason,
            reason: 'La fricción o el bajo reconocimiento de contexto hacen que no convenga promover esta sugerencia.',
            evidenceLabel: `Fricción ${Math.round(suggestion.friction)} · ${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted.toLowerCase()} ${percentLabel(suggestion.contextAcceptedRate)}`,
            ...UNAVAILABLE_TREND,
            suggestionId: suggestion.id,
            alertId: suggestion.alertId,
            metrics: [
                scoreMetric('Fricción', suggestion.friction),
                rateMetric(OPERATIONAL_CONTEXT_STATUS_LABELS.accepted, suggestion.contextAcceptedRate),
                rateMetric('Click rate', suggestion.clickRate),
            ],
        }));
}

function buildOperationalOpportunities(alerts: OperationalAlert[]): OperationalInsight[] {
    return alerts
        .filter((alert) => alert.value > 0)
        .sort((left, right) => {
            const severityWeight = { critical: 3, warning: 2, info: 1 };
            if (severityWeight[right.severity] !== severityWeight[left.severity]) {
                return severityWeight[right.severity] - severityWeight[left.severity];
            }
            return right.value - left.value;
        })
        .slice(0, 4)
        .map((alert) => ({
            id: `opportunity-${alert.id}`,
            title: `Oportunidad: ${alert.name}`,
            description: `${alert.definition} Este insight solo explica el desvío activo; no ejecuta acciones.`,
            kind: 'operational-opportunity',
            priority: priorityForOpportunity(alert),
            severity: alert.severity,
            owner: alert.owner,
            source: alert.source,
            signal: alert.trigger,
            reason: 'La prioridad viene de la severidad operativa actual de la alerta.',
            evidenceLabel: `${alert.threshold} · valor actual ${Math.round(alert.value)}`,
            ...UNAVAILABLE_TREND,
            alertId: alert.id,
            metrics: [
                countMetric('Valor actual', alert.value),
            ],
        }));
}

export async function getOperationalInsightsSecure(
    rawFilters: OperationalKpiFilters,
): Promise<OperationalInsightsResult> {
    const suggestionsResult = await getOperationalSuggestionsSecure(rawFilters);
    if (!suggestionsResult.success) {
        return { success: false, error: suggestionsResult.error };
    }

    const baseTopUsefulActions = buildTopUsefulActions(suggestionsResult.data.suggestions);
    const baseFrictionSignals = buildFrictionSignals(suggestionsResult.data.suggestions);
    const baseOperationalOpportunities = buildOperationalOpportunities(suggestionsResult.data.alerts);
    const previousFilters = derivePreviousWindow(suggestionsResult.data.scope);
    const previousSuggestionsResult = previousFilters
        ? await getOperationalSuggestionsSecure(previousFilters)
        : null;
    const previousInsights = previousSuggestionsResult?.success
        ? [
            ...buildTopUsefulActions(previousSuggestionsResult.data.suggestions),
            ...buildFrictionSignals(previousSuggestionsResult.data.suggestions),
            ...buildOperationalOpportunities(previousSuggestionsResult.data.alerts),
        ]
        : [];
    const trendWindow = previousFilters
        ? trendWindowLabel(suggestionsResult.data.scope, previousFilters)
        : UNAVAILABLE_TREND.trendWindow;
    const topUsefulActions = applyTrendComparisons({
        currentInsights: baseTopUsefulActions,
        previousInsights,
        trendWindow,
    });
    const frictionSignals = applyTrendComparisons({
        currentInsights: baseFrictionSignals,
        previousInsights,
        trendWindow,
    });
    const operationalOpportunities = applyTrendComparisons({
        currentInsights: baseOperationalOpportunities,
        previousInsights,
        trendWindow,
    });
    const executiveSummary = buildExecutiveSummary({
        topUsefulActions,
        frictionSignals,
        operationalOpportunities,
    });

    return {
        success: true,
        data: {
            scope: suggestionsResult.data.scope,
            generatedAt: suggestionsResult.data.generatedAt,
            signalSource: 'quick-action-tuning-baseline',
            topUsefulActions,
            frictionSignals,
            operationalOpportunities,
            insights: [
                ...topUsefulActions,
                ...frictionSignals,
                ...operationalOpportunities,
            ],
            executiveSummary,
            exclusions: [...OPERATIONAL_INSIGHT_EXCLUSIONS],
        },
    };
}
