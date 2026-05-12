/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addBreadcrumbMock } = vi.hoisted(() => ({
    addBreadcrumbMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: addBreadcrumbMock,
}));

import {
    emitOperationalQuickActionUxEvent,
    OPERATIONAL_QUICK_ACTION_UX_EVENT,
    resolveOperationalQuickActionDestinationStatus,
    type OperationalQuickActionUxEvent,
} from '@/lib/operational-quick-action-telemetry';

describe('operational quick action telemetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('emite breadcrumb y CustomEvent con payload minimo sanitizado', () => {
        const received: OperationalQuickActionUxEvent[] = [];
        const listener = (event: Event) => {
            received.push((event as CustomEvent<OperationalQuickActionUxEvent>).detail);
        };
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);

        emitOperationalQuickActionUxEvent({
            event: 'quick_action_clicked',
            alertId: 'inventory-critical-low-stock',
            suggestionId: 'suggest-prepare-smart-order',
            targetModule: 'procurement',
            actionMode: 'prefill-safe',
            destination: '/procurement/smart-order',
            hasDateRange: true,
            hasLocationId: true,
            hasWarehouseId: true,
        });

        expect(addBreadcrumbMock).toHaveBeenCalledWith(expect.objectContaining({
            category: 'operational.quick-action',
            message: 'quick_action_clicked',
            data: expect.objectContaining({
                alertId: 'inventory-critical-low-stock',
                hasLocationId: true,
                hasWarehouseId: true,
            }),
        }));
        expect(received).toEqual([
            expect.objectContaining({
                event: 'quick_action_clicked',
                destination: '/procurement/smart-order',
            }),
        ]);
        window.removeEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);
    });

    it('clasifica contexto de destino sin autorizar por URL', () => {
        expect(resolveOperationalQuickActionDestinationStatus({
            source: undefined,
            isOperationalSuggestion: false,
            contextAccepted: false,
        })).toBe('contextIgnored');
        expect(resolveOperationalQuickActionDestinationStatus({
            source: 'operational-suggestion',
            isOperationalSuggestion: false,
            contextAccepted: false,
        })).toBe('contextRejected');
        expect(resolveOperationalQuickActionDestinationStatus({
            source: 'operational-suggestion',
            isOperationalSuggestion: true,
            contextAccepted: true,
        })).toBe('contextAccepted');
    });

    it('congela contrato transversal: destino invalido no autoriza y payload extra no se emite', () => {
        const received: OperationalQuickActionUxEvent[] = [];
        const listener = (event: Event) => {
            received.push((event as CustomEvent<OperationalQuickActionUxEvent>).detail);
        };
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);

        expect(resolveOperationalQuickActionDestinationStatus({
            source: 'operational-suggestion',
            isOperationalSuggestion: true,
            contextAccepted: false,
        })).toBe('contextRejected');

        const eventWithExtraFields: OperationalQuickActionUxEvent & {
            userId: string;
            sessionId: string;
            rawUrl: string;
        } = {
            event: 'destination_context_rejected',
            alertId: 'wms-pending-transfers',
            targetModule: 'wms',
            actionMode: 'prefill-safe',
            destination: '/reports',
            destinationStatus: 'contextRejected',
            reason: 'warehouseId no pertenece al scope server-side',
            hasDateRange: true,
            hasLocationId: true,
            hasWarehouseId: true,
            userId: 'user-sensitive',
            sessionId: 'session-sensitive',
            rawUrl: '/reports?token=secret',
        };

        emitOperationalQuickActionUxEvent(eventWithExtraFields);

        const emitted = received[0];
        expect(emitted).toEqual({
            event: 'destination_context_rejected',
            alertId: 'wms-pending-transfers',
            suggestionId: undefined,
            targetModule: 'wms',
            actionMode: 'prefill-safe',
            destination: '/reports',
            destinationStatus: 'contextRejected',
            reason: 'warehouseId no pertenece al scope server-side',
            hasDateRange: true,
            hasLocationId: true,
            hasWarehouseId: true,
        });
        expect('userId' in emitted).toBe(false);
        expect('sessionId' in emitted).toBe(false);
        expect('rawUrl' in emitted).toBe(false);

        window.removeEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, listener);
    });
});
