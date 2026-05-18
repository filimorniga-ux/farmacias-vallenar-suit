import { describe, expect, it } from 'vitest';
import {
    scoreOperationalSuggestion,
    tuneAndRankOperationalSuggestions,
    type OperationalSuggestionTuningSignal,
} from '@/lib/operational-suggestion-tuning';

const suggestions = [
    {
        id: 'guided',
        alertId: 'inventory-critical-low-stock',
        priority: 'immediate' as const,
        actionMode: 'prefill-safe' as const,
        targetModule: 'procurement' as const,
    },
    {
        id: 'noisy',
        alertId: 'sales-no-activity',
        priority: 'today' as const,
        actionMode: 'navigate-only' as const,
        targetModule: 'caja' as const,
    },
    {
        id: 'report',
        alertId: 'wms-pending-transfers',
        priority: 'today' as const,
        actionMode: 'prefill-safe' as const,
        targetModule: 'wms' as const,
    },
];

describe('operational suggestion tuning', () => {
    it('calcula score deterministico sin depender de persistencia externa', () => {
        const first = scoreOperationalSuggestion(suggestions[0]);
        const second = scoreOperationalSuggestion(suggestions[0]);

        expect(first).toEqual(second);
        expect(first.score).toBeGreaterThan(0);
        expect(first.qualityTier).toBe('recommended');
    });

    it('rankea sugerencias utiles y deja ruido al final', () => {
        const signals: OperationalSuggestionTuningSignal[] = [
            { alertId: 'inventory-critical-low-stock', shown: 20, clicked: 12, contextAccepted: 10, contextRejected: 1, contextIgnored: 0 },
            { alertId: 'sales-no-activity', shown: 20, clicked: 1, contextAccepted: 0, contextRejected: 8, contextIgnored: 6 },
            { alertId: 'wms-pending-transfers', shown: 20, clicked: 5, contextAccepted: 4, contextRejected: 0, contextIgnored: 1 },
        ];

        const ranked = tuneAndRankOperationalSuggestions(suggestions, signals);

        expect(ranked.map((suggestion) => suggestion.id)).toEqual(['guided', 'report', 'noisy']);
        expect(ranked[0].qualityTier).toBe('recommended');
        expect(ranked[2].qualityTier).toBe('suppressed');
        expect(ranked[2].tuningReason).toBe('señal baja o fricción alta');
    });

    it('penaliza contexto rechazado o ignorado aunque haya clicks', () => {
        const signal: OperationalSuggestionTuningSignal[] = [
            { alertId: 'sales-no-activity', shown: 10, clicked: 8, contextAccepted: 0, contextRejected: 6, contextIgnored: 2 },
        ];

        const scored = scoreOperationalSuggestion(suggestions[1], signal);

        expect(scored.friction).toBeGreaterThan(15);
        expect(scored.qualityTier).toBe('suppressed');
    });
});
