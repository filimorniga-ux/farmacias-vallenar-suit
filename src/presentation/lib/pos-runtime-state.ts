import type { Terminal } from '@/domain/types';

type PosSessionHint = {
    terminalId?: string | null;
    locationId?: string | null;
} | null | undefined;

export function resolvePosBootstrapContext(params: {
    currentTerminalId?: string | null;
    currentLocationId?: string | null;
    persistedSession?: PosSessionHint;
    storedLocationId?: string | null;
    contextLocationId?: string | null;
}) {
    return {
        terminalId:
            params.currentTerminalId ||
            params.persistedSession?.terminalId ||
            null,
        locationId:
            params.currentLocationId ||
            params.persistedSession?.locationId ||
            params.storedLocationId ||
            params.contextLocationId ||
            null,
    };
}

export function sanitizePersistedPosTerminals(terminals: Terminal[]): Terminal[] {
    return terminals.map((terminal) => ({
        ...terminal,
        status: 'CLOSED',
        current_cashier_id: undefined,
        current_cashier_name: undefined,
        opened_at: undefined,
        authorized_by_name: undefined,
        blind_counts_count: undefined,
        session_id: undefined,
        session_start_time: undefined,
        session_opening_amount: undefined,
        session_user_id: undefined,
    }));
}
