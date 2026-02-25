import { describe, expect, it } from 'vitest';
import { canAuthorizeShiftClosure } from '@/actions/shift-handover-policy';

describe('shift-handover-policy', () => {
    it('permite cierre cuando actor es dueño del turno', () => {
        expect(
            canAuthorizeShiftClosure({
                shiftOwnerUserId: 'user-1',
                actorUserId: 'user-1',
                supervisorRole: 'CASHIER'
            })
        ).toBe(true);
    });

    it('permite override cuando actor no es dueño pero supervisor es gerente', () => {
        expect(
            canAuthorizeShiftClosure({
                shiftOwnerUserId: 'user-1',
                actorUserId: 'user-2',
                supervisorRole: 'GERENTE_GENERAL'
            })
        ).toBe(true);
    });

    it('bloquea cierre cruzado sin rol supervisor', () => {
        expect(
            canAuthorizeShiftClosure({
                shiftOwnerUserId: 'user-1',
                actorUserId: 'user-2',
                supervisorRole: 'CASHIER'
            })
        ).toBe(false);
    });

    it('permite cuando no hay dueño de turno (estado degradado)', () => {
        expect(
            canAuthorizeShiftClosure({
                shiftOwnerUserId: null,
                actorUserId: 'user-2',
                supervisorRole: 'CASHIER'
            })
        ).toBe(true);
    });
});
