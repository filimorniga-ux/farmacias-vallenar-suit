
import { useCallback } from 'react';

const SESSION_KEY = 'pos_session_id';
const SESSION_METADATA_KEY = 'pos_session_metadata';

export interface LocalSession {
    sessionId: string;
    terminalId: string;
    terminalName: string;
    userId: string;
    openedAt: number;
    openingAmount: number;
}

export function useTerminalSession() {
    const saveSession = useCallback((data: LocalSession) => {
        if (typeof window !== 'undefined') {
            // Save sessionId as direct string for compatibility
            localStorage.setItem(SESSION_KEY, data.sessionId);
            // Save full metadata separately
            localStorage.setItem(SESSION_METADATA_KEY, JSON.stringify(data));
        }
    }, []);

    const getSession = useCallback((): LocalSession | null => {
        if (typeof window === 'undefined') return null;
        const sessionId = localStorage.getItem(SESSION_KEY);
        if (!sessionId) return null;

        // Try to get full metadata
        const metadataStr = localStorage.getItem(SESSION_METADATA_KEY);
        if (metadataStr) {
            try {
                return JSON.parse(metadataStr) as LocalSession;
            } catch (e) {
                console.error("Failed to parse session metadata", e);
            }
        }

        // Fallback: return minimal session info
        return {
            sessionId,
            terminalId: '',
            terminalName: '',
            userId: '',
            openedAt: 0,
            openingAmount: 0
        };
    }, []);

    const clearSession = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_METADATA_KEY);
        }
    }, []);

    return {
        saveSession,
        getSession,
        clearSession
    };
}
