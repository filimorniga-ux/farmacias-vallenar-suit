import type { Terminal } from '@/domain/types';

interface ResolveTerminalSelectionInput {
    terminals: Terminal[];
    userId?: string;
    currentSelection?: string;
}

/**
 * Prioriza la terminal del usuario con sesión activa.
 * Si no existe, mantiene selección previa válida.
 * Si solo hay una terminal, la auto-selecciona.
 */
export function resolvePreferredTerminalSelection(input: ResolveTerminalSelectionInput): string {
    const { terminals, userId, currentSelection } = input;

    const myActiveTerminal = terminals.find(
        (t) => t.status === 'OPEN' && t.current_cashier_id === userId
    );
    if (myActiveTerminal) {
        return myActiveTerminal.id;
    }

    if (currentSelection && terminals.some((t) => t.id === currentSelection)) {
        return currentSelection;
    }

    if (terminals.length === 1) {
        return terminals[0].id;
    }

    return '';
}
