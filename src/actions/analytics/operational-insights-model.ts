import type { OperationalAlertsPayload } from './operational-alerts-model';

export type OperationalInsightKind =
    | 'quick-action-value'
    | 'quick-action-friction'
    | 'operational-opportunity';

export type OperationalInsightSeverity = 'info' | 'warning' | 'critical';
export type OperationalInsightPriority = 'high' | 'medium' | 'low';
export type OperationalInsightTrendDirection = 'up' | 'down' | 'flat' | 'unavailable';

export type OperationalInsightOwner =
    | 'ventas'
    | 'caja'
    | 'inventario'
    | 'procurement'
    | 'wms';

export interface OperationalInsightMetric {
    label: string;
    value: number;
    unit: 'percent' | 'score' | 'count';
}

export interface OperationalInsight {
    id: string;
    title: string;
    description: string;
    kind: OperationalInsightKind;
    priority: OperationalInsightPriority;
    severity: OperationalInsightSeverity;
    owner: OperationalInsightOwner;
    source: string;
    signal: string;
    reason: string;
    evidenceLabel: string;
    trendDirection: OperationalInsightTrendDirection;
    trendWindow: string;
    trendEvidenceLabel: string;
    metrics: OperationalInsightMetric[];
    alertId?: string;
    suggestionId?: string;
}

export type OperationalExecutiveSummaryType =
    | 'attention'
    | 'friction'
    | 'opportunity';

export interface OperationalExecutiveSummaryItem {
    id: string;
    headline: string;
    severity: OperationalInsightSeverity;
    summaryType: OperationalExecutiveSummaryType;
    supportingEvidence: string;
    sourceInsightId: string;
}

export interface OperationalInsightsPayload {
    scope: OperationalAlertsPayload['scope'];
    generatedAt: string;
    signalSource: 'quick-action-tuning-baseline';
    topUsefulActions: OperationalInsight[];
    frictionSignals: OperationalInsight[];
    operationalOpportunities: OperationalInsight[];
    insights: OperationalInsight[];
    executiveSummary: OperationalExecutiveSummaryItem[];
    exclusions: Array<{ name: string; reason: string }>;
}

export type OperationalInsightsResult =
    | { success: true; data: OperationalInsightsPayload }
    | { success: false; error: string };

export const OPERATIONAL_INSIGHT_EXCLUSIONS = [
    {
        name: 'éxito operativo posterior a la navegación',
        reason: 'la observabilidad UX no confirma que el usuario haya resuelto el caso',
    },
    {
        name: 'patrones repetidos históricos',
        reason: 'no hay serie persistida de eventos UX en este corte',
    },
    {
        name: 'automatización o ejecución de acciones',
        reason: 'E13.1 solo interpreta señales; no ejecuta operaciones',
    },
    {
        name: 'forecast, IA o scoring nuevo',
        reason: 'se reutiliza la señal determinística ya validada en E12',
    },
] as const;
