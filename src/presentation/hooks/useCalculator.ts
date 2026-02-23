import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeBrowserStateStorage } from '@/lib/store/safePersistStorage';

interface HistoryEntry {
    expression: string;
    result: string;
    timestamp: number;
}

interface CalculatorState {
    // UI State
    isOpen: boolean;
    isMinimized: boolean;

    // Calculator State
    display: string;
    expression: string;
    previousValue: number | null;
    operator: string | null;
    waitingForOperand: boolean;

    // History
    history: HistoryEntry[];

    // Actions
    open: () => void;
    close: () => void;
    toggleMinimize: () => void;
    inputDigit: (digit: string) => void;
    inputDecimal: () => void;
    setOperator: (op: string) => void;
    calculate: () => void;
    clear: () => void;
    percentage: () => void;
    squareRoot: () => void;
    toggleSign: () => void;
    backspace: () => void;
    clearHistory: () => void;
}

function performOperation(a: number, op: string, b: number): number {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '×': return a * b;
        case '÷': return b !== 0 ? a / b : NaN;
        default: return b;
    }
}

function formatNumber(n: number): string {
    if (isNaN(n)) return 'Error';
    if (!isFinite(n)) return 'Error';
    // Limit display to reasonable precision
    const str = Number(n.toPrecision(12)).toString();
    return str.length > 15 ? n.toExponential(6) : str;
}

export const useCalculatorStore = create<CalculatorState>()(
    persist(
        (set, get) => ({
            isOpen: false,
            isMinimized: false,
            display: '0',
            expression: '',
            previousValue: null,
            operator: null,
            waitingForOperand: false,
            history: [],

            open: () => set({ isOpen: true, isMinimized: false }),
            close: () => set({ isOpen: false, isMinimized: false }),
            toggleMinimize: () => set(s => ({ isMinimized: !s.isMinimized })),

            inputDigit: (digit) => {
                const { display, waitingForOperand } = get();
                if (waitingForOperand) {
                    set({ display: digit, waitingForOperand: false });
                } else {
                    // Limit display length
                    if (display.replace(/[^0-9]/g, '').length >= 15) return;
                    set({ display: display === '0' ? digit : display + digit });
                }
            },

            inputDecimal: () => {
                const { display, waitingForOperand } = get();
                if (waitingForOperand) {
                    set({ display: '0.', waitingForOperand: false });
                } else if (!display.includes('.')) {
                    set({ display: display + '.' });
                }
            },

            setOperator: (op) => {
                const { display, previousValue, operator, waitingForOperand, expression } = get();
                const current = parseFloat(display);

                if (previousValue !== null && !waitingForOperand && operator) {
                    const result = performOperation(previousValue, operator, current);
                    const formatted = formatNumber(result);
                    set({
                        display: formatted,
                        previousValue: result,
                        operator: op,
                        waitingForOperand: true,
                        expression: `${expression} ${display} ${op}`,
                    });
                } else {
                    set({
                        previousValue: current,
                        operator: op,
                        waitingForOperand: true,
                        expression: `${display} ${op}`,
                    });
                }
            },

            calculate: () => {
                const { display, previousValue, operator, expression } = get();
                if (previousValue === null || !operator) return;

                const current = parseFloat(display);
                const result = performOperation(previousValue, operator, current);
                const formatted = formatNumber(result);
                const fullExpr = `${expression} ${display}`;

                // Add to history (max 10)
                const { history } = get();
                const newEntry: HistoryEntry = {
                    expression: fullExpr,
                    result: formatted,
                    timestamp: Date.now(),
                };
                const newHistory = [newEntry, ...history].slice(0, 10);

                set({
                    display: formatted,
                    expression: '',
                    previousValue: null,
                    operator: null,
                    waitingForOperand: true,
                    history: newHistory,
                });
            },

            clear: () => set({
                display: '0',
                expression: '',
                previousValue: null,
                operator: null,
                waitingForOperand: false,
            }),

            percentage: () => {
                const { display } = get();
                const val = parseFloat(display) / 100;
                set({ display: formatNumber(val) });
            },

            squareRoot: () => {
                const { display, history } = get();
                const val = parseFloat(display);
                const result = Math.sqrt(val);
                const formatted = formatNumber(result);

                const newEntry: HistoryEntry = {
                    expression: `√${display}`,
                    result: formatted,
                    timestamp: Date.now(),
                };
                const newHistory = [newEntry, ...history].slice(0, 10);

                set({
                    display: formatted,
                    waitingForOperand: true,
                    history: newHistory,
                });
            },

            toggleSign: () => {
                const { display } = get();
                const val = parseFloat(display);
                set({ display: formatNumber(-val) });
            },

            backspace: () => {
                const { display } = get();
                if (display.length <= 1 || (display.length === 2 && display.startsWith('-'))) {
                    set({ display: '0' });
                } else {
                    set({ display: display.slice(0, -1) });
                }
            },

            clearHistory: () => set({ history: [] }),
        }),
        {
            name: 'pharma-calculator',
            storage: createJSONStorage(() => safeBrowserStateStorage),
            partialize: (state) => ({
                history: state.history,
            }),
        }
    )
);
