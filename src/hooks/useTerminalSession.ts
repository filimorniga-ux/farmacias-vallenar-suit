
import { useCallback } from 'react';

const SESSION_KEY = 'pos_session_id';

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
            localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        }
    }, []);

    const getSession = useCallback((): LocalSession | null => {
        if (typeof window === 'undefined') return null;
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return null;
        try {
            return JSON.parse(stored) as LocalSession;
        } catch (e) {
            console.error("Failed to parse local session", e);
            return null;
        }
    }, []);

    const clearSession = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(SESSION_KEY);
        }
    }, []);

    return {
        saveSession,
        getSession,
        clearSession
    };
}
