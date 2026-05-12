'use server';

import {
    getOperationalAlertsSecure,
} from './operational-alerts';
import type {
    OperationalAlert,
    OperationalAlertsResult,
} from './operational-alerts-model';
import type { OperationalKpiFilters } from './operational-kpis';
import { buildOperationalQuickActionHref } from '@/lib/operational-quick-actions';
import {
    OPERATIONAL_QUICK_ACTION_GUARDS,
    OPERATIONAL_SUGGESTION_EXCLUSIONS,
    type OperationalSuggestion,
    type OperationalSuggestionsResult,
} from './operational-suggestion-model';
import {
    tuneAndRankOperationalSuggestions,
} from '@/lib/operational-suggestion-tuning';

function santiagoTimestamp(date: Date) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

function alertContext(alert: OperationalAlert) {
    return {
        startDate: alert.drilldown.filters.startDate,
        endDate: alert.drilldown.filters.endDate,
        locationId: alert.drilldown.filters.locationId,
        warehouseId: alert.drilldown.filters.warehouseId,
        source: 'operational-suggestion',
        alertId: alert.id,
    };
}

type OperationalSuggestionDraft = Omit<
    OperationalSuggestion,
    'category'
    | 'score'
    | 'usefulness'
    | 'friction'
    | 'clickRate'
    | 'contextAcceptedRate'
    | 'qualityTier'
    | 'tuningReason'
>;

function buildSuggestion(alert: OperationalAlert): OperationalSuggestionDraft | null {
    const context = alertContext(alert);

    switch (alert.id) {
        case 'cash-long-open-sessions':
            return {
                id: 'suggest-review-long-cash-session',
                alertId: alert.id,
                title: 'Revisar caja abierta',
                description: 'Identifica la sesión larga antes de cerrar turno o seguir vendiendo.',
                actionLabel: 'Revisar caja',
                href: buildOperationalQuickActionHref('/reports', context, { tab: 'cash' }),
                actionMode: 'prefill-safe',
                safeBecause: 'abre reporte de caja con filtros efectivos; no cierra ni modifica la sesión',
                priority: 'immediate',
                owner: alert.owner,
                targetModule: 'reports',
                source: alert.source,
            };
        case 'inventory-critical-low-stock':
            return {
                id: 'suggest-prepare-smart-order',
                alertId: alert.id,
                title: 'Preparar orden de compra',
                description: 'Abre pedido inteligente con el contexto activo para revisar reposición.',
                actionLabel: 'Preparar pedido',
                href: buildOperationalQuickActionHref('/procurement/smart-order', context),
                actionMode: 'prefill-safe',
                safeBecause: 'solo precarga contexto de sucursal/bodega; la orden exige proveedor, cantidades y confirmación',
                priority: 'immediate',
                owner: alert.owner,
                targetModule: 'procurement',
                source: alert.source,
            };
        case 'sales-no-activity':
            return {
                id: 'suggest-review-cash-opening',
                alertId: alert.id,
                title: 'Revisar apertura de caja',
                description: 'Confirma que la caja esté abierta y que la sucursal pueda vender.',
                actionLabel: 'Ir a caja',
                href: buildOperationalQuickActionHref('/caja', context),
                actionMode: 'navigate-only',
                safeBecause: 'abre el flujo POS; la sesión real se valida server-side en el módulo de caja',
                priority: 'today',
                owner: alert.owner,
                targetModule: 'caja',
                source: alert.source,
            };
        case 'procurement-stale-open-orders':
            return {
                id: 'suggest-follow-up-stale-orders',
                alertId: alert.id,
                title: 'Dar seguimiento a órdenes',
                description: 'Revisa órdenes antiguas antes de crear nuevas solicitudes de compra.',
                actionLabel: 'Ver órdenes',
                href: buildOperationalQuickActionHref('/reports', context, { tab: 'procurement', detail: 'open-orders' }),
                actionMode: 'prefill-safe',
                safeBecause: 'abre el reporte de órdenes con filtros; no cancela ni cambia estado',
                priority: 'today',
                owner: alert.owner,
                targetModule: 'reports',
                source: alert.source,
            };
        case 'procurement-open-orders':
            return {
                id: 'suggest-review-open-orders',
                alertId: alert.id,
                title: 'Revisar backlog de compras',
                description: 'Valida qué órdenes siguen abiertas antes de tomar nuevas decisiones.',
                actionLabel: 'Abrir compras',
                href: buildOperationalQuickActionHref('/reports', context, { tab: 'procurement', detail: 'open-orders' }),
                actionMode: 'prefill-safe',
                safeBecause: 'abre el reporte de compras con contexto efectivo; no ejecuta compras',
                priority: 'soon',
                owner: alert.owner,
                targetModule: 'reports',
                source: alert.source,
            };
        case 'wms-pending-transfers':
            return {
                id: 'suggest-inspect-pending-transfers',
                alertId: alert.id,
                title: 'Inspeccionar transferencias',
                description: 'Revisa envíos pendientes antes de reintentar o pedir confirmación.',
                actionLabel: 'Ver transferencias',
                href: buildOperationalQuickActionHref('/reports', context, { tab: 'logistics', detail: 'transfers' }),
                actionMode: 'prefill-safe',
                safeBecause: 'abre logística filtrada; no reintenta ni cambia estado WMS',
                priority: 'today',
                owner: alert.owner,
                targetModule: 'wms',
                source: alert.source,
            };
        case 'wms-pending-receptions':
            return {
                id: 'suggest-inspect-pending-receptions',
                alertId: alert.id,
                title: 'Inspeccionar recepciones',
                description: 'Revisa ingresos pendientes antes de marcar stock como disponible.',
                actionLabel: 'Ver recepciones',
                href: buildOperationalQuickActionHref('/reports', context, { tab: 'logistics', detail: 'receptions' }),
                actionMode: 'prefill-safe',
                safeBecause: 'abre recepciones filtradas; no confirma ingreso de stock',
                priority: 'today',
                owner: alert.owner,
                targetModule: 'wms',
                source: alert.source,
            };
        default:
            return null;
    }
}

export async function getOperationalSuggestionsSecure(
    rawFilters: OperationalKpiFilters,
): Promise<OperationalSuggestionsResult> {
    const alertsResult: OperationalAlertsResult = await getOperationalAlertsSecure(rawFilters);
    if (!alertsResult.success) {
        return { success: false, error: alertsResult.error };
    }

    const baseSuggestions = alertsResult.data.alerts
        .map(buildSuggestion)
        .filter((suggestion): suggestion is OperationalSuggestionDraft => Boolean(suggestion));
    const suggestions = tuneAndRankOperationalSuggestions(baseSuggestions);

    const suggestionsByAlertId = suggestions.reduce<Record<string, OperationalSuggestion>>((acc, suggestion) => {
        acc[suggestion.alertId] = suggestion;
        return acc;
    }, {});
    const rankedAlertIds = suggestions.map((suggestion) => suggestion.alertId);
    const rankedAlerts = [
        ...rankedAlertIds
            .map((alertId) => alertsResult.data.alerts.find((alert) => alert.id === alertId))
            .filter((alert): alert is OperationalAlert => Boolean(alert)),
        ...alertsResult.data.alerts.filter((alert) => !rankedAlertIds.includes(alert.id)),
    ];

    return {
        success: true,
        data: {
            scope: alertsResult.data.scope,
            generatedAt: santiagoTimestamp(new Date()),
            alerts: rankedAlerts,
            alertExclusions: alertsResult.data.exclusions,
            suggestions,
            suggestionsByAlertId,
            rankedAlertIds,
            suppressedSuggestionIds: suggestions
                .filter((suggestion) => suggestion.qualityTier === 'suppressed')
                .map((suggestion) => suggestion.id),
            blockedQuickActions: OPERATIONAL_QUICK_ACTION_GUARDS.filter((guard) =>
                alertsResult.data.alerts.some((alert) => alert.id === guard.alertId)
            ),
            exclusions: [...OPERATIONAL_SUGGESTION_EXCLUSIONS],
        },
    };
}
