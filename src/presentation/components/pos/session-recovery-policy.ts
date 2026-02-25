export type SessionRecoveryDecision = 'RESUME_SAME_USER' | 'BLOCK_FOREIGN_SESSION' | 'NO_ACTION';

interface SessionRecoveryInput {
    isOpen: boolean;
    sessionId?: string | null;
    serverCashierId?: string | null;
    currentUserId?: string | null;
}

export function decideSessionRecovery(input: SessionRecoveryInput): SessionRecoveryDecision {
    if (!input.isOpen || !input.sessionId) {
        return 'NO_ACTION';
    }

    if (input.serverCashierId && input.currentUserId && input.serverCashierId === input.currentUserId) {
        return 'RESUME_SAME_USER';
    }

    return 'BLOCK_FOREIGN_SESSION';
}
