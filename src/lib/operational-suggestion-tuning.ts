import type {
    OperationalSuggestionMode,
    OperationalSuggestionPriority,
} from '@/actions/analytics/operational-suggestion-model';

export type OperationalSuggestionCategory =
    | 'informational-navigation'
    | 'guided-action'
    | 'operational-action';

export type OperationalSuggestionQualityTier =
    | 'recommended'
    | 'standard'
    | 'suppressed';

export interface OperationalSuggestionTuningSignal {
    alertId: string;
    shown: number;
    clicked: number;
    contextAccepted: number;
    contextRejected: number;
    contextIgnored: number;
}

export interface OperationalSuggestionTuningMetrics {
    score: number;
    usefulness: number;
    friction: number;
    clickRate: number;
    contextAcceptedRate: number;
    qualityTier: OperationalSuggestionQualityTier;
    tuningReason: string;
}

interface TunableSuggestion {
    id: string;
    alertId: string;
    priority: OperationalSuggestionPriority;
    actionMode: OperationalSuggestionMode;
    targetModule: 'caja' | 'procurement' | 'wms' | 'reports';
}

export type TunedSuggestion<T extends TunableSuggestion> = T & {
    category: OperationalSuggestionCategory;
    score: number;
    usefulness: number;
    friction: number;
    clickRate: number;
    contextAcceptedRate: number;
    qualityTier: OperationalSuggestionQualityTier;
    tuningReason: string;
};

export const DEFAULT_QUICK_ACTION_TUNING_SIGNALS: OperationalSuggestionTuningSignal[] = [
    { alertId: 'inventory-critical-low-stock', shown: 10, clicked: 6, contextAccepted: 5, contextRejected: 1, contextIgnored: 0 },
    { alertId: 'cash-long-open-sessions', shown: 10, clicked: 5, contextAccepted: 5, contextRejected: 0, contextIgnored: 0 },
    { alertId: 'procurement-stale-open-orders', shown: 10, clicked: 4, contextAccepted: 4, contextRejected: 0, contextIgnored: 0 },
    { alertId: 'procurement-open-orders', shown: 10, clicked: 3, contextAccepted: 3, contextRejected: 0, contextIgnored: 1 },
    { alertId: 'wms-pending-transfers', shown: 10, clicked: 3, contextAccepted: 3, contextRejected: 0, contextIgnored: 1 },
    { alertId: 'wms-pending-receptions', shown: 10, clicked: 3, contextAccepted: 3, contextRejected: 0, contextIgnored: 1 },
    { alertId: 'sales-no-activity', shown: 10, clicked: 2, contextAccepted: 1, contextRejected: 2, contextIgnored: 1 },
];

function clampRate(numerator: number, denominator: number) {
    if (denominator <= 0) return 0;
    return Math.max(0, Math.min(1, numerator / denominator));
}

function normalizeCount(value: number) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function classifyOperationalSuggestion(
    suggestion: Pick<TunableSuggestion, 'actionMode' | 'targetModule'>,
): OperationalSuggestionCategory {
    if (suggestion.targetModule === 'procurement' && suggestion.actionMode === 'prefill-safe') {
        return 'guided-action';
    }
    if (suggestion.targetModule === 'caja') {
        return 'operational-action';
    }
    return 'informational-navigation';
}

export function scoreOperationalSuggestion(
    suggestion: TunableSuggestion,
    signals: OperationalSuggestionTuningSignal[] = DEFAULT_QUICK_ACTION_TUNING_SIGNALS,
): OperationalSuggestionTuningMetrics {
    const signal = signals.find((item) => item.alertId === suggestion.alertId);
    const category = classifyOperationalSuggestion(suggestion);
    const shown = normalizeCount(signal?.shown ?? 0);
    const clicked = normalizeCount(signal?.clicked ?? 0);
    const accepted = normalizeCount(signal?.contextAccepted ?? 0);
    const rejected = normalizeCount(signal?.contextRejected ?? 0);
    const ignored = normalizeCount(signal?.contextIgnored ?? 0);
    const contextTotal = accepted + rejected + ignored;

    const clickRate = clampRate(clicked, shown);
    const acceptedRate = clampRate(accepted, contextTotal);
    const rejectedRate = clampRate(rejected, contextTotal);
    const ignoredRate = clampRate(ignored, contextTotal);

    const priorityWeight = {
        immediate: 20,
        today: 12,
        soon: 6,
    } satisfies Record<OperationalSuggestionPriority, number>;
    const actionModeWeight = {
        'prefill-safe': 12,
        'navigate-only': 4,
        'not-allowed-yet': -20,
    } satisfies Record<OperationalSuggestionMode, number>;
    const categoryWeight = {
        'guided-action': 18,
        'informational-navigation': 10,
        'operational-action': 4,
    } satisfies Record<OperationalSuggestionCategory, number>;

    const usefulness = Math.round(
        priorityWeight[suggestion.priority]
        + actionModeWeight[suggestion.actionMode]
        + categoryWeight[category]
        + clickRate * 30
        + acceptedRate * 25,
    );
    const friction = Math.round(
        rejectedRate * 25
        + ignoredRate * 18
        + (shown >= 10 && clicked === 0 ? 12 : 0)
        + (suggestion.actionMode === 'not-allowed-yet' ? 20 : 0),
    );
    const score = usefulness - friction;

    const qualityTier: OperationalSuggestionQualityTier =
        ignoredRate >= 0.6 || rejectedRate >= 0.45 || score < 25
            ? 'suppressed'
            : score >= 65 && acceptedRate >= 0.7
                ? 'recommended'
                : 'standard';
    const tuningReason = qualityTier === 'recommended'
        ? 'alta señal de contexto útil'
        : qualityTier === 'suppressed'
            ? 'señal baja o fricción alta'
            : 'señal suficiente, mantener visible';

    return {
        score,
        usefulness,
        friction,
        clickRate,
        contextAcceptedRate: acceptedRate,
        qualityTier,
        tuningReason,
    };
}

export function tuneAndRankOperationalSuggestions<T extends TunableSuggestion>(
    suggestions: T[],
    signals: OperationalSuggestionTuningSignal[] = DEFAULT_QUICK_ACTION_TUNING_SIGNALS,
): Array<TunedSuggestion<T>> {
    return suggestions
        .map((suggestion) => {
            const metrics = scoreOperationalSuggestion(suggestion, signals);
            return {
                ...suggestion,
                category: classifyOperationalSuggestion(suggestion),
                ...metrics,
            };
        })
        .sort((left, right) => {
            if (left.qualityTier === 'suppressed' && right.qualityTier !== 'suppressed') return 1;
            if (right.qualityTier === 'suppressed' && left.qualityTier !== 'suppressed') return -1;
            if (right.score !== left.score) return right.score - left.score;
            return left.id.localeCompare(right.id);
        });
}
