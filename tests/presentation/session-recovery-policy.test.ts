import { describe, expect, it } from 'vitest';
import { decideSessionRecovery } from '@/presentation/components/pos/session-recovery-policy';

describe('session-recovery-policy', () => {
    it('reanuda cuando la sesion abierta es del mismo usuario', () => {
        expect(decideSessionRecovery({
            isOpen: true,
            sessionId: 's1',
            serverCashierId: 'u1',
            currentUserId: 'u1'
        })).toBe('RESUME_SAME_USER');
    });

    it('bloquea cuando la sesion pertenece a otro usuario', () => {
        expect(decideSessionRecovery({
            isOpen: true,
            sessionId: 's1',
            serverCashierId: 'u1',
            currentUserId: 'u2'
        })).toBe('BLOCK_FOREIGN_SESSION');
    });

    it('no hace nada si no hay sesion abierta valida', () => {
        expect(decideSessionRecovery({
            isOpen: false,
            sessionId: null,
            serverCashierId: 'u1',
            currentUserId: 'u1'
        })).toBe('NO_ACTION');
    });
});
