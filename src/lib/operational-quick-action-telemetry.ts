import * as Sentry from '@sentry/nextjs';
import type { OperationalSuggestionMode } from '@/actions/analytics/operational-suggestion-model';

export type OperationalQuickActionUxEventName =
    | 'suggestion_shown'
    | 'quick_action_visible'
    | 'quick_action_clicked'
    | 'destination_opened'
    | 'destination_context_accepted'
    | 'destination_context_rejected'
    | 'destination_context_ignored';

export type OperationalQuickActionDestinationStatus =
    | 'contextAccepted'
    | 'contextRejected'
    | 'contextIgnored';

export interface OperationalQuickActionUxEvent {
    event: OperationalQuickActionUxEventName;
    alertId?: string;
    suggestionId?: string;
    targetModule?: string;
    actionMode?: OperationalSuggestionMode;
    destination?: string;
    destinationStatus?: OperationalQuickActionDestinationStatus;
    reason?: string;
    hasDateRange?: boolean;
    hasLocationId?: boolean;
    hasWarehouseId?: boolean;
}

export const OPERATIONAL_QUICK_ACTION_UX_EVENT = 'operational-quick-action-ux';

export function resolveOperationalQuickActionDestinationStatus(params: {
    source?: string;
    isOperationalSuggestion: boolean;
    contextAccepted: boolean;
}): OperationalQuickActionDestinationStatus {
    if (!params.source) {
        return 'contextIgnored';
    }
    if (!params.isOperationalSuggestion || !params.contextAccepted) {
        return 'contextRejected';
    }
    return 'contextAccepted';
}

export function emitOperationalQuickActionUxEvent(event: OperationalQuickActionUxEvent) {
    const sanitized: OperationalQuickActionUxEvent = {
        event: event.event,
        alertId: event.alertId,
        suggestionId: event.suggestionId,
        targetModule: event.targetModule,
        actionMode: event.actionMode,
        destination: event.destination,
        destinationStatus: event.destinationStatus,
        reason: event.reason,
        hasDateRange: event.hasDateRange,
        hasLocationId: event.hasLocationId,
        hasWarehouseId: event.hasWarehouseId,
    };

    Sentry.addBreadcrumb({
        category: 'operational.quick-action',
        message: sanitized.event,
        level: 'info',
        data: sanitized,
    });

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(OPERATIONAL_QUICK_ACTION_UX_EVENT, { detail: sanitized }));
    }
}
