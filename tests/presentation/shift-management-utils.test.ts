import { describe, expect, it } from 'vitest';
import { resolvePreferredTerminalSelection } from '@/presentation/components/pos/shift-management-utils';
import type { Terminal } from '@/domain/types';

function terminal(partial: Partial<Terminal>): Terminal {
    return {
        id: partial.id || 't-1',
        name: partial.name || 'Caja',
        status: partial.status || 'CLOSED',
        location_id: partial.location_id || 'loc-1',
        current_cashier_id: partial.current_cashier_id,
        ...partial
    } as Terminal;
}

describe('shift-management-utils', () => {
    it('prioriza terminal activa del usuario', () => {
        const terminals = [
            terminal({ id: 't-1', status: 'OPEN', current_cashier_id: 'u-1' }),
            terminal({ id: 't-2', status: 'CLOSED' })
        ];

        const selected = resolvePreferredTerminalSelection({
            terminals,
            userId: 'u-1',
            currentSelection: ''
        });

        expect(selected).toBe('t-1');
    });

    it('mantiene selección vigente si existe', () => {
        const terminals = [
            terminal({ id: 't-1', status: 'OPEN', current_cashier_id: 'u-2' }),
            terminal({ id: 't-2', status: 'CLOSED' })
        ];

        const selected = resolvePreferredTerminalSelection({
            terminals,
            userId: 'u-1',
            currentSelection: 't-2'
        });

        expect(selected).toBe('t-2');
    });

    it('autoselecciona si solo hay una terminal', () => {
        const terminals = [terminal({ id: 'solo', status: 'OPEN', current_cashier_id: 'u-2' })];

        const selected = resolvePreferredTerminalSelection({
            terminals,
            userId: 'u-1',
            currentSelection: ''
        });

        expect(selected).toBe('solo');
    });

    it('retorna vacío si no hay selección válida ni opción única', () => {
        const terminals = [
            terminal({ id: 't-1', status: 'OPEN', current_cashier_id: 'u-2' }),
            terminal({ id: 't-2', status: 'CLOSED' })
        ];

        const selected = resolvePreferredTerminalSelection({
            terminals,
            userId: 'u-1',
            currentSelection: ''
        });

        expect(selected).toBe('');
    });
});
