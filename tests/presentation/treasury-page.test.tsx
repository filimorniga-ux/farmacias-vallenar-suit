/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreasuryPage from '@/app/finance/treasury/page';

const mocks = vi.hoisted(() => {
    const getFinancialAccountsSecureMock = vi.fn();
    const getTreasuryTransactionsSecureMock = vi.fn();
    const getPendingRemittancesSecureMock = vi.fn();
    const transferFundsSecureMock = vi.fn();
    const confirmRemittanceSecureMock = vi.fn();
    const toastSuccessMock = vi.fn();
    const toastErrorMock = vi.fn();

    const pharmaState = {
        user: {
            id: 'user-1',
            name: 'Tesorero Test',
            role: 'TESORERO',
        },
        currentLocationId: 'loc-1',
    };

    const locationState = {
        locations: [
            {
                id: 'loc-1',
                name: 'Sucursal Centro',
                is_active: true,
            },
        ],
    };

    const accounts = [
        {
            id: 'safe-1',
            location_id: 'loc-1',
            name: 'Caja Fuerte',
            type: 'SAFE' as const,
            balance: 500000,
            is_active: true,
        },
        {
            id: 'bank-1',
            location_id: 'loc-1',
            name: 'Banco Estado',
            type: 'BANK' as const,
            balance: 900000,
            is_active: true,
        },
    ];

    const remittances = [
        {
            id: 'rem-1',
            location_id: 'loc-1',
            source_terminal_id: 'term-1',
            amount: 25000,
            status: 'PENDING_RECEIPT' as const,
            created_at: '2026-04-01T12:00:00.000Z',
            created_by: 'cashier-1',
        },
    ];

    const transactions = [
        {
            id: 'tx-1',
            account_id: 'safe-1',
            amount: 25000,
            type: 'IN' as const,
            description: 'Ingreso por Remesa',
            created_at: new Date('2026-04-01T12:30:00.000Z'),
        },
    ];

    return {
        getFinancialAccountsSecureMock,
        getTreasuryTransactionsSecureMock,
        getPendingRemittancesSecureMock,
        transferFundsSecureMock,
        confirmRemittanceSecureMock,
        toastSuccessMock,
        toastErrorMock,
        pharmaState,
        locationState,
        accounts,
        remittances,
        transactions,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector?: (state: typeof mocks.pharmaState) => unknown) =>
        selector ? selector(mocks.pharmaState) : mocks.pharmaState,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector?: (state: typeof mocks.locationState) => unknown) =>
        selector ? selector(mocks.locationState) : mocks.locationState,
}));

vi.mock('@/actions/treasury-v2', () => ({
    transferFundsSecure: mocks.transferFundsSecureMock,
    confirmRemittanceSecure: mocks.confirmRemittanceSecureMock,
    getFinancialAccountsSecure: mocks.getFinancialAccountsSecureMock,
    getTreasuryTransactionsSecure: mocks.getTreasuryTransactionsSecureMock,
    getPendingRemittancesSecure: mocks.getPendingRemittancesSecureMock,
}));

vi.mock('@/presentation/components/treasury/TreasuryHistoryTab', () => ({
    TreasuryHistoryTab: () => <div>Historial Tesoreria</div>,
}));

vi.mock('@/presentation/components/security/PinAuthorizationModal', () => ({
    PinAuthorizationModal: ({
        isOpen,
        onConfirm,
    }: {
        isOpen: boolean;
        onConfirm: (pin: string) => Promise<void>;
    }) => (isOpen ? <button onClick={() => void onConfirm('1234')}>Confirmar PIN</button> : null),
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
    },
}));

describe('TreasuryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getFinancialAccountsSecureMock.mockResolvedValue({
            success: true,
            data: mocks.accounts,
        });
        mocks.getPendingRemittancesSecureMock.mockResolvedValue({
            success: true,
            data: mocks.remittances,
        });
        mocks.getTreasuryTransactionsSecureMock.mockResolvedValue({
            success: true,
            data: mocks.transactions,
        });
        mocks.transferFundsSecureMock.mockResolvedValue({
            success: true,
            transferId: 'transfer-1',
        });
        mocks.confirmRemittanceSecureMock.mockResolvedValue({
            success: true,
        });
    });

    it('transferencia refresca cuentas y transacciones, pero no remesas', async () => {
        render(<TreasuryPage />);

        await waitFor(() => {
            expect(mocks.getFinancialAccountsSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getPendingRemittancesSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getTreasuryTransactionsSecureMock).toHaveBeenCalledWith('safe-1');
        });

        mocks.getFinancialAccountsSecureMock.mockClear();
        mocks.getPendingRemittancesSecureMock.mockClear();
        mocks.getTreasuryTransactionsSecureMock.mockClear();

        fireEvent.click(screen.getByRole('button', { name: /registrar salida/i }));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bank-1' } });
        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '15000' } });
        fireEvent.change(screen.getByPlaceholderText(/depósito diario/i), { target: { value: 'Traslado diario' } });
        fireEvent.click(screen.getByRole('button', { name: /confirmar salida/i }));

        await waitFor(() => {
            expect(mocks.transferFundsSecureMock).toHaveBeenCalledWith({
                fromAccountId: 'safe-1',
                toAccountId: 'bank-1',
                amount: 15000,
                description: 'Traspaso a Banco Estado - Traslado diario',
                authorizationPin: undefined,
            });
        });

        await waitFor(() => {
            expect(mocks.getFinancialAccountsSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getTreasuryTransactionsSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.getPendingRemittancesSecureMock).not.toHaveBeenCalled();
    });

    it('confirmación de remesa refresca cuentas, transacciones y remesas', async () => {
        render(<TreasuryPage />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /confirmar recepción/i })).toBeTruthy();
        });

        mocks.getFinancialAccountsSecureMock.mockClear();
        mocks.getPendingRemittancesSecureMock.mockClear();
        mocks.getTreasuryTransactionsSecureMock.mockClear();

        fireEvent.click(screen.getByRole('button', { name: /confirmar recepción/i }));
        fireEvent.click(screen.getByRole('button', { name: /confirmar pin/i }));

        await waitFor(() => {
            expect(mocks.confirmRemittanceSecureMock).toHaveBeenCalledWith({
                remittanceId: 'rem-1',
                managerPin: '1234',
            });
        });

        await waitFor(() => {
            expect(mocks.getFinancialAccountsSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getTreasuryTransactionsSecureMock).toHaveBeenCalledTimes(1);
            expect(mocks.getPendingRemittancesSecureMock).toHaveBeenCalledTimes(1);
        });
    });
});
