import type {
    OperationalAlert,
    OperationalAlertsPayload,
} from './operational-alerts-model';
import type {
    OperationalSuggestionCategory,
    OperationalSuggestionQualityTier,
} from '@/lib/operational-suggestion-tuning';

export type OperationalSuggestionPriority = 'immediate' | 'today' | 'soon';
export type OperationalSuggestionMode = 'navigate-only' | 'prefill-safe' | 'not-allowed-yet';

export interface OperationalQuickActionGuard {
    alertId: string;
    blockedAction: string;
    reason: string;
}

export interface OperationalSuggestion {
    id: string;
    alertId: string;
    title: string;
    description: string;
    actionLabel: string;
    href: string;
    actionMode: OperationalSuggestionMode;
    safeBecause: string;
    priority: OperationalSuggestionPriority;
    owner: OperationalAlert['owner'];
    targetModule: 'caja' | 'procurement' | 'wms' | 'reports';
    source: string;
    category: OperationalSuggestionCategory;
    score: number;
    usefulness: number;
    friction: number;
    clickRate: number;
    contextAcceptedRate: number;
    qualityTier: OperationalSuggestionQualityTier;
    tuningReason: string;
}

export interface OperationalSuggestionsPayload {
    scope: OperationalAlertsPayload['scope'];
    generatedAt: string;
    alerts: OperationalAlert[];
    alertExclusions: OperationalAlertsPayload['exclusions'];
    suggestions: OperationalSuggestion[];
    suggestionsByAlertId: Record<string, OperationalSuggestion>;
    rankedAlertIds: string[];
    suppressedSuggestionIds: string[];
    blockedQuickActions: OperationalQuickActionGuard[];
    exclusions: Array<{ name: string; reason: string }>;
}

export type OperationalSuggestionsResult =
    | { success: true; data: OperationalSuggestionsPayload }
    | { success: false; error: string };

export const OPERATIONAL_SUGGESTION_EXCLUSIONS = [
    { name: 'crear órdenes automáticamente', reason: 'E12.2 solo asiste; no ejecuta compras ni aprobaciones' },
    { name: 'cerrar o reabrir cajas automáticamente', reason: 'requiere intervención explícita del operador' },
    { name: 'reintentar transferencias automáticamente', reason: 'WMS mantiene ownership operativo manual en este corte' },
    { name: 'notificaciones push/email', reason: 'fuera de alcance hasta definir canal, owner y rate limit' },
    { name: 'sugerencias IA/forecast', reason: 'solo se usan contratos ready y señales determinísticas' },
] as const;

export const OPERATIONAL_QUICK_ACTION_GUARDS: OperationalQuickActionGuard[] = [
    {
        alertId: 'inventory-critical-low-stock',
        blockedAction: 'crear orden de compra automáticamente',
        reason: 'la cantidad, proveedor y aprobación siguen requiriendo decisión explícita',
    },
    {
        alertId: 'cash-long-open-sessions',
        blockedAction: 'cerrar caja automáticamente',
        reason: 'el cierre impacta dinero y debe pasar por revisión del operador',
    },
    {
        alertId: 'wms-pending-transfers',
        blockedAction: 'reintentar transferencia automáticamente',
        reason: 'WMS puede afectar stock físico y requiere inspección previa',
    },
    {
        alertId: 'wms-pending-receptions',
        blockedAction: 'marcar recepción automáticamente',
        reason: 'la recepción cambia disponibilidad de stock y requiere confirmación',
    },
    {
        alertId: 'procurement-stale-open-orders',
        blockedAction: 'cancelar o reenviar orden automáticamente',
        reason: 'el seguimiento a proveedor no tiene contrato transaccional seguro en este corte',
    },
];
