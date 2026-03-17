/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CashReceiptsReport } from '@/presentation/components/reports/CashReceiptsReport';

const mocks = vi.hoisted(() => ({
    getCashReceiptsMock: vi.fn(),
    getReceiptDetailsMock: vi.fn(),
    printSaleTicketMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({ isMobile: true, isDesktopLike: false, isLandscape: false, viewportWidth: 390 }),
}));

vi.mock('@/actions/analytics/cash-receipts', () => ({
    getCashReceipts: mocks.getCashReceiptsMock,
    getReceiptDetails: mocks.getReceiptDetailsMock,
}));

vi.mock('@/presentation/store/useSettingsStore', () => ({
    useSettingsStore: () => ({ hardware: {} }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: () => ({ currentLocation: { name: 'Farmacia Test', config: {} } }),
}));

vi.mock('@/presentation/utils/print-utils', () => ({
    printSaleTicket: mocks.printSaleTicketMock,
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
        info: vi.fn(),
    },
}));

describe('CashReceiptsReport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCashReceiptsMock.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'rcp-1',
                    timestamp: '2026-03-17T12:00:00.000Z',
                    user_name: 'Caja 1',
                    items_summary: 'Paracetamol 500mg',
                    items_count: 1,
                    total_amount: 12990,
                    status: 'COMPLETED',
                    dte_folio: 'R-101',
                },
            ],
        });
        mocks.getReceiptDetailsMock.mockResolvedValue({
            success: true,
            data: [
                { name: 'Paracetamol 500mg', quantity: 1, price: 12990, total: 12990 },
            ],
        });
    });

    it('renderiza cards móviles y abre el detalle del recibo', async () => {
        render(
            <CashReceiptsReport
                startDate={new Date('2026-03-01T00:00:00.000Z')}
                endDate={new Date('2026-03-31T23:59:59.000Z')}
            />
        );

        await waitFor(() => {
            expect(mocks.getCashReceiptsMock).toHaveBeenCalledTimes(1);
        });

        const receiptCard = await screen.findByTestId('receipt-card-rcp-1');
        expect(receiptCard).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();

        fireEvent.click(receiptCard);

        await waitFor(() => {
            expect(mocks.getReceiptDetailsMock).toHaveBeenCalledWith('rcp-1');
        });

        expect(await screen.findByText('Detalle de Recibo')).toBeTruthy();
        expect((await screen.findAllByText('Paracetamol 500mg')).length).toBeGreaterThan(1);
    });
});
