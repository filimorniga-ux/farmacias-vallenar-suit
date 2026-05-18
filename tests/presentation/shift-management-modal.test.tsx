/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShiftManagementModal from '@/presentation/components/pos/ShiftManagementModal';

const localStorageStore: Record<string, string> = {};

const mocks = vi.hoisted(() => {
    const fetchEmployeesSecureMock = vi.fn();
    const getTerminalsByLocationSecureMock = vi.fn();
    const getSuggestedOpeningAmountMock = vi.fn();
    const openTerminalWithPinValidationMock = vi.fn();
    const forceCloseTerminalShiftMock = vi.fn();
    const fetchLocationsMock = vi.fn();
    const fetchTerminalsMock = vi.fn();
    const saveSessionMock = vi.fn();
    const routerPushMock = vi.fn();
    const openShiftMock = vi.fn();
    const resumeShiftMock = vi.fn();
    const onCloseMock = vi.fn();

    const pharmaState = {
        employees: [
            {
                id: 'cashier-1',
                name: 'Ana Caja',
                role: 'CASHIER',
                assigned_location_id: 'loc-1',
            },
        ],
        terminals: [
            {
                id: 'term-1',
                name: 'Caja 1',
                location_id: 'loc-1',
                status: 'CLOSED',
                current_cashier_id: null,
                session_id: null,
            },
        ],
        user: {
            id: 'admin-1',
            name: 'Admin Test',
            role: 'ADMIN',
            assigned_location_id: 'loc-1',
        },
        currentLocationId: 'loc-1',
        openShift: openShiftMock,
        resumeShift: resumeShiftMock,
        fetchTerminals: fetchTerminalsMock,
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
            setState: vi.fn((updater: Partial<typeof pharmaState> | ((state: typeof pharmaState) => Partial<typeof pharmaState>)) => {
                const partial = typeof updater === 'function' ? updater(pharmaState) : updater;
                Object.assign(pharmaState, partial);
            }),
        }
    );

    const locationState = {
        locations: [
            {
                id: 'loc-1',
                name: 'Sucursal Centro',
                is_active: true,
            },
        ],
        currentLocation: {
            id: 'loc-1',
            name: 'Sucursal Centro',
            is_active: true,
        },
        fetchLocations: fetchLocationsMock,
        switchLocation: vi.fn(),
    };

    return {
        fetchEmployeesSecureMock,
        getTerminalsByLocationSecureMock,
        getSuggestedOpeningAmountMock,
        openTerminalWithPinValidationMock,
        forceCloseTerminalShiftMock,
        fetchLocationsMock,
        fetchTerminalsMock,
        saveSessionMock,
        routerPushMock,
        openShiftMock,
        resumeShiftMock,
        onCloseMock,
        pharmaState,
        locationState,
        usePharmaStoreMock,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: Object.assign(
        function <T>(selector?: (state: typeof mocks.locationState) => T) {
            return selector ? selector(mocks.locationState) : (mocks.locationState as T);
        },
        {
            getState: () => mocks.locationState,
        }
    ),
}));

vi.mock('@/actions/sync-v2', () => ({
    fetchEmployeesSecure: mocks.fetchEmployeesSecureMock,
}));

vi.mock('@/actions/terminals-v2', () => ({
    openTerminalAtomic: vi.fn(),
    openTerminalWithPinValidation: mocks.openTerminalWithPinValidationMock,
    forceCloseTerminalShift: mocks.forceCloseTerminalShiftMock,
    getTerminalStatusAtomic: vi.fn(),
    getTerminalsByLocationSecure: mocks.getTerminalsByLocationSecureMock,
    getSuggestedOpeningAmount: mocks.getSuggestedOpeningAmountMock,
}));

vi.mock('@/hooks/useTerminalSession', () => ({
    useTerminalSession: () => ({
        saveSession: mocks.saveSessionMock,
    }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mocks.routerPushMock,
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: (key: string) => localStorageStore[key] ?? null,
        setItem: (key: string, value: string) => {
            localStorageStore[key] = value;
        },
        removeItem: (key: string) => {
            delete localStorageStore[key];
        },
    },
    writable: true,
});

describe('ShiftManagementModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete localStorageStore.pos_session_id;
        delete localStorageStore.pos_session_metadata;
        delete localStorageStore.current_location_id;

        mocks.pharmaState.employees = [
            {
                id: 'cashier-1',
                name: 'Ana Caja',
                role: 'CASHIER',
                assigned_location_id: 'loc-1',
            },
        ];
        mocks.pharmaState.user = {
            id: 'admin-1',
            name: 'Admin Test',
            role: 'ADMIN',
            assigned_location_id: 'loc-1',
        };
        mocks.pharmaState.terminals = [
            {
                id: 'term-1',
                name: 'Caja 1',
                location_id: 'loc-1',
                status: 'CLOSED',
                current_cashier_id: null,
                session_id: null,
            },
        ];
        mocks.locationState.locations = [
            {
                id: 'loc-1',
                name: 'Sucursal Centro',
                is_active: true,
            },
        ];
        mocks.getSuggestedOpeningAmountMock.mockResolvedValue({ success: false, amount: 0 });
    });

    it('reutiliza empleados y terminales seeded sin refetch redundante al abrir', async () => {
        render(<ShiftManagementModal isOpen onClose={mocks.onCloseMock} />);

        await waitFor(() => {
            expect(screen.getByRole('option', { name: /caja 1/i })).toBeTruthy();
        });

        expect(mocks.fetchLocationsMock).not.toHaveBeenCalled();
        expect(mocks.fetchEmployeesSecureMock).not.toHaveBeenCalled();
        expect(mocks.getTerminalsByLocationSecureMock).not.toHaveBeenCalled();
        expect(mocks.fetchTerminalsMock).not.toHaveBeenCalled();
    });

    it('permite asignar la cuenta DEV GERENTE_GENERAL al abrir caja', async () => {
        mocks.pharmaState.user = {
            id: 'dev-gerente',
            name: '[DEV] Gerente General 1',
            role: 'GERENTE_GENERAL',
            assigned_location_id: '',
        };
        mocks.pharmaState.employees = [
            {
                id: 'dev-gerente',
                name: '[DEV] Gerente General 1',
                role: 'GERENTE_GENERAL',
                assigned_location_id: '',
            },
            {
                id: 'cashier-1',
                name: 'Ana Caja',
                role: 'CASHIER',
                assigned_location_id: 'loc-1',
            },
        ];

        render(<ShiftManagementModal isOpen onClose={mocks.onCloseMock} />);

        await waitFor(() => {
            expect(screen.getByRole('option', { name: /\[DEV\] Gerente General 1/i })).toBeTruthy();
        });
    });

    it('hace fallback a server solo cuando faltan employees o terminals seeded', async () => {
        mocks.pharmaState.employees = [];
        mocks.pharmaState.terminals = [];
        mocks.fetchEmployeesSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'cashier-1',
                    name: 'Ana Caja',
                    role: 'CASHIER',
                    assigned_location_id: 'loc-1',
                },
            ],
        });
        mocks.getTerminalsByLocationSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'term-1',
                    name: 'Caja 1',
                    location_id: 'loc-1',
                    status: 'CLOSED',
                    current_cashier_id: null,
                    session_id: null,
                },
            ],
        });

        render(<ShiftManagementModal isOpen onClose={mocks.onCloseMock} />);

        await waitFor(() => {
            expect(mocks.fetchEmployeesSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getTerminalsByLocationSecureMock).toHaveBeenCalledWith('loc-1');
        });

        expect(mocks.fetchTerminalsMock).not.toHaveBeenCalled();
    });

    it('mantiene intacta la confirmación de apertura', async () => {
        mocks.openTerminalWithPinValidationMock.mockResolvedValue({
            success: true,
            sessionId: 'sess-1',
            authorizedById: 'manager-1',
            autoCheckInTriggered: false,
        });

        render(<ShiftManagementModal isOpen onClose={mocks.onCloseMock} />);

        await waitFor(() => {
            expect(screen.getByRole('option', { name: /caja 1/i })).toBeTruthy();
        });

        const combos = screen.getAllByRole('combobox');
        const cashierSelect = combos[2];
        const openingInput = screen.getByPlaceholderText('0');

        fireEvent.change(cashierSelect, { target: { value: 'cashier-1' } });
        fireEvent.change(openingInput, { target: { value: '5.000' } });
        fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

        const pinInput = screen.getByPlaceholderText('••••');
        fireEvent.change(pinInput, { target: { value: '1234' } });
        fireEvent.click(screen.getByRole('button', { name: /autorizar apertura/i }));

        await waitFor(() => {
            expect(mocks.openTerminalWithPinValidationMock).toHaveBeenCalledWith(
                'term-1',
                'cashier-1',
                5000,
                '1234'
            );
        });

        expect(mocks.saveSessionMock).toHaveBeenCalledWith({
            sessionId: 'sess-1',
            terminalId: 'term-1',
            terminalName: 'Caja 1',
            userId: 'cashier-1',
            locationId: 'loc-1',
            openedAt: expect.any(Number),
            openingAmount: 5000,
        });
        expect(mocks.openShiftMock).toHaveBeenCalledWith(
            5000,
            'cashier-1',
            'manager-1',
            'term-1',
            'loc-1',
            'sess-1'
        );
        expect(mocks.routerPushMock).toHaveBeenCalledWith('/pos');
        expect(mocks.onCloseMock).toHaveBeenCalled();
    });
});
