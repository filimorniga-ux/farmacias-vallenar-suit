/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from '@/presentation/pages/ReportsPage';

const mocks = vi.hoisted(() => ({
    pushMock: vi.fn(),
    exportCashFlowMock: vi.fn(),
    exportLogisticsMock: vi.fn(),
    exportTaxMock: vi.fn(),
    exportAttendanceSummaryMock: vi.fn(),
    getCashFlowLedgerMock: vi.fn(),
    getDetailedFinancialSummaryMock: vi.fn(),
    getTaxSummaryMock: vi.fn(),
    getInventoryValuationMock: vi.fn(),
    getLogisticsKPIsMock: vi.fn(),
    getStockMovementsDetailMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mocks.pushMock,
    }),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector?: (state: any) => any) => {
        const state = {
            currentWarehouseId: 'warehouse-1',
            currentLocationId: 'loc-1',
            user: { role: 'MANAGER' },
        };
        return selector ? selector(state) : state;
    },
}));

vi.mock('@/presentation/components/bi/TimeFilter', () => ({
    __esModule: true,
    default: () => <div data-testid="time-filter">time-filter</div>,
}));

vi.mock('@/actions/reports-detail-v2', () => ({
    getCashFlowLedgerSecure: mocks.getCashFlowLedgerMock,
    getDetailedFinancialSummarySecure: mocks.getDetailedFinancialSummaryMock,
    getTaxSummarySecure: mocks.getTaxSummaryMock,
    getInventoryValuationSecure: mocks.getInventoryValuationMock,
    getLogisticsKPIsSecure: mocks.getLogisticsKPIsMock,
    getStockMovementsDetailSecure: mocks.getStockMovementsDetailMock,
}));

vi.mock('@/actions/finance-export-v2', () => ({
    exportCashFlowSecure: mocks.exportCashFlowMock,
    exportLogisticsReportSecure: mocks.exportLogisticsMock,
    exportPayrollSecure: vi.fn(),
    exportTaxSummarySecure: mocks.exportTaxMock,
}));

vi.mock('@/actions/attendance-export-v2', () => ({
    exportAttendanceSummarySecure: mocks.exportAttendanceSummaryMock,
}));

vi.mock('@/presentation/components/reports/CashReceiptsReport', () => ({
    CashReceiptsReport: () => <div>cash-receipts</div>,
}));

vi.mock('@/presentation/components/reports/HRReportTab', () => ({
    HRReportTab: ({ roleFilter, onRoleFilterChange }: { roleFilter: string; onRoleFilterChange: (role: string) => void }) => (
        <div>
            <div data-testid="hr-role-filter">{roleFilter}</div>
            <button onClick={() => onRoleFilterChange('CASHIER')}>Cambiar filtro RRHH</button>
        </div>
    ),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('ReportsPage export consistency', () => {
    function renderWithQueryClient(ui: React.ReactElement) {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                {ui}
            </QueryClientProvider>
        );
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        mocks.getCashFlowLedgerMock.mockResolvedValue({
            success: true,
            data: [],
        });
        mocks.getDetailedFinancialSummaryMock.mockResolvedValue({
            success: true,
            data: {
                total_sales: 0,
                total_payroll: 0,
                total_social_security: 0,
                total_operational_expenses: 0,
                net_income: 0,
            },
        });
        mocks.getTaxSummaryMock.mockResolvedValue({ success: true, data: { period: 'abril', total_vat_debit: 0, total_net_sales: 0, total_vat_credit: 0, total_net_purchases: 0, estimated_tax_payment: 0 } });
        mocks.getInventoryValuationMock.mockResolvedValue({
            success: true,
            data: {
                total_cost_value: 0,
                total_sales_value: 0,
                potential_gross_margin: 0,
                top_products: [],
            },
        });
        mocks.getLogisticsKPIsMock.mockResolvedValue({
            success: true,
            data: {
                total_in: 0,
                total_out: 0,
                last_movement: '2024-01-31T10:00:00.000Z',
            },
        });
        mocks.getStockMovementsDetailMock.mockResolvedValue({ success: true, data: [] });

        mocks.exportCashFlowMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'cash.xlsx' });
        mocks.exportLogisticsMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'logistics.xlsx' });
        mocks.exportTaxMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'tax.xlsx' });
        mocks.exportAttendanceSummaryMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'attendance.xlsx' });
    });

    it('navega al reporte de ventas por producto sin react-router', async () => {
        renderWithQueryClient(<ReportsPage />);

        fireEvent.click(await screen.findByRole('button', { name: /Ventas por Producto/i }));

        expect(mocks.pushMock).toHaveBeenCalledWith('/reports/sales-by-product');
    });

    it('usa export logístico dedicado en vez del fallback de caja', async () => {
        renderWithQueryClient(<ReportsPage />);

        fireEvent.click(await screen.findByRole('button', { name: /Logística/i }));
        await screen.findByText(/Costo Inmovilizado/i);
        fireEvent.click(screen.getByRole('button', { name: /Exportar/i }));

        await waitFor(() => {
            expect(mocks.exportLogisticsMock).toHaveBeenCalledWith({
                startDate: expect.any(String),
                endDate: expect.any(String),
                warehouseId: 'warehouse-1',
                movementType: undefined,
            });
        });

        expect(mocks.exportCashFlowMock).not.toHaveBeenCalled();
    });

    it('propaga el roleFilter visible al export de RRHH', async () => {
        renderWithQueryClient(<ReportsPage />);

        fireEvent.click(await screen.findByRole('button', { name: /RR\.HH\./i }));
        await screen.findByTestId('hr-role-filter');
        fireEvent.click(screen.getByRole('button', { name: /Cambiar filtro RRHH/i }));
        fireEvent.click(screen.getByRole('button', { name: /Exportar/i }));

        await waitFor(() => {
            expect(mocks.exportAttendanceSummaryMock).toHaveBeenCalledWith({
                startDate: expect.any(String),
                endDate: expect.any(String),
                locationId: 'loc-1',
                role: 'CASHIER',
            });
        });
    });

    it('no carga tabs inactivos y reutiliza caché al volver', async () => {
        renderWithQueryClient(<ReportsPage />);

        await waitFor(() => {
            expect(mocks.getCashFlowLedgerMock).toHaveBeenCalledTimes(1);
            expect(mocks.getDetailedFinancialSummaryMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.getTaxSummaryMock).not.toHaveBeenCalled();
        expect(mocks.getInventoryValuationMock).not.toHaveBeenCalled();
        expect(mocks.getLogisticsKPIsMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Logística/i }));

        await waitFor(() => {
            expect(mocks.getInventoryValuationMock).toHaveBeenCalledTimes(1);
            expect(mocks.getLogisticsKPIsMock).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /Flujo de Caja/i }));
        await screen.findByText(/Cartola de Movimientos/i);

        fireEvent.click(screen.getByRole('button', { name: /Logística/i }));
        await screen.findByText(/Costo Inmovilizado/i);

        expect(mocks.getInventoryValuationMock).toHaveBeenCalledTimes(1);
        expect(mocks.getLogisticsKPIsMock).toHaveBeenCalledTimes(1);
    });
});
