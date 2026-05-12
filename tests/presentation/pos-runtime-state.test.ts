import { describe, expect, it } from 'vitest';
import { resolvePosBootstrapContext, sanitizePersistedPosTerminals } from '@/presentation/lib/pos-runtime-state';

describe('pos-runtime-state', () => {
    it('prioriza store activo sobre hints persistidos para terminal y ubicación', () => {
        const result = resolvePosBootstrapContext({
            currentTerminalId: 'term-store',
            currentLocationId: 'loc-store',
            persistedSession: {
                terminalId: 'term-session',
                locationId: 'loc-session',
            },
            storedLocationId: 'loc-current',
            contextLocationId: 'loc-context',
        });

        expect(result).toEqual({
            terminalId: 'term-store',
            locationId: 'loc-store',
        });
    });

    it('usa la sesión POS dedicada como hint antes que claves legacy de ubicación', () => {
        const result = resolvePosBootstrapContext({
            currentTerminalId: '',
            currentLocationId: '',
            persistedSession: {
                terminalId: 'term-session',
                locationId: 'loc-session',
            },
            storedLocationId: 'loc-current',
            contextLocationId: 'loc-context',
        });

        expect(result).toEqual({
            terminalId: 'term-session',
            locationId: 'loc-session',
        });
    });

    it('limpia runtime sensible al persistir terminales POS', () => {
        const sanitized = sanitizePersistedPosTerminals([
            {
                id: 'term-1',
                name: 'Caja 1',
                location_id: 'loc-1',
                status: 'OPEN',
                current_cashier_id: 'cashier-1',
                current_cashier_name: 'Ana Caja',
                opened_at: Date.now(),
                authorized_by_name: 'Manager',
                session_id: 'sess-1',
                session_start_time: Date.now(),
                session_opening_amount: 5000,
                session_user_id: 'cashier-1',
            },
        ]);

        expect(sanitized).toEqual([
            expect.objectContaining({
                id: 'term-1',
                status: 'CLOSED',
                current_cashier_id: undefined,
                current_cashier_name: undefined,
                session_id: undefined,
                session_start_time: undefined,
                session_opening_amount: undefined,
                session_user_id: undefined,
            }),
        ]);
    });
});
