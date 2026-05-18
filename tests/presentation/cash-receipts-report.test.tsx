/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CashReceiptsReport } from '@/presentation/components/reports/CashReceiptsReport';

const mocks = vi.hoisted(() => ({
    getCashReceiptsMock: vi.fn(),
    getReceiptDetailsMock: vi.fn(),
    printSaleTicketMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    xlsxBookNewMock: vi.fn(),
    xlsxJsonToSheetMock: vi.fn(() => ({})),
    xlsxAppendSheetMock: vi.fn(),
    xlsxWriteFileMock: vi.fn(),
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

vi.mock('xlsx', () => ({
    utils: {
        book_new: mocks.xlsxBookNewMock,
        json_to_sheet: mocks.xlsxJsonToSheetMock,
        book_append_sheet: mocks.xlsxAppendSheetMock,
    },
    writeFile: mocks.xlsxWriteFileMock,
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
        info: vi.fn(),
    },
}));

describe('CashReceiptsReport', () => {
    function renderWithQueryClient(ui: React.ReactElement, queryClient?: QueryClient) {
        const client = queryClient ?? new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        return render(
            <QueryClientProvider client={client}>
                {ui}
            </QueryClientProvider>
        );
    }

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
        renderWithQueryClient(
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

    it('reutiliza cache al remontar con el mismo QueryClient', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        const props = {
            startDate: new Date('2026-03-01T00:00:00.000Z'),
            endDate: new Date('2026-03-31T23:59:59.000Z'),
        };

        const firstRender = renderWithQueryClient(<CashReceiptsReport {...props} />, queryClient);

        await waitFor(() => {
            expect(mocks.getCashReceiptsMock).toHaveBeenCalledTimes(1);
        });

        firstRender.unmount();

        renderWithQueryClient(<CashReceiptsReport {...props} />, queryClient);

        await screen.findByTestId('receipt-card-rcp-1');
        expect(mocks.getCashReceiptsMock).toHaveBeenCalledTimes(1);
    });

    it('carga xlsx solo al exportar', async () => {
        renderWithQueryClient(
            <CashReceiptsReport
                startDate={new Date('2026-03-01T00:00:00.000Z')}
                endDate={new Date('2026-03-31T23:59:59.000Z')}
            />
        );

        await screen.findByTestId('receipt-card-rcp-1');

        expect(mocks.xlsxBookNewMock).not.toHaveBeenCalled();
        expect(mocks.xlsxWriteFileMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Excel/i }));

        await waitFor(() => {
            expect(mocks.xlsxBookNewMock).toHaveBeenCalledTimes(1);
            expect(mocks.xlsxWriteFileMock).toHaveBeenCalledTimes(1);
        });
    });
});
