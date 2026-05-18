/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from '@/presentation/pages/ReportsPage';
import { OPERATIONAL_QUICK_ACTION_UX_EVENT } from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
} from '@/lib/operational-message-catalog';

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
    getCriticalLowStockReportMock: vi.fn(),
    getOpenPurchaseOrdersReportMock: vi.fn(),
    getPendingShipmentsReportMock: vi.fn(),
    searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mocks.pushMock,
    }),
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: vi.fn(),
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
    getCriticalLowStockReportSecure: mocks.getCriticalLowStockReportMock,
    getOpenPurchaseOrdersReportSecure: mocks.getOpenPurchaseOrdersReportMock,
    getPendingShipmentsReportSecure: mocks.getPendingShipmentsReportMock,
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
        mocks.searchParams = new URLSearchParams();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        Object.defineProperty(window.URL, 'createObjectURL', {
            value: vi.fn(() => 'blob:reports-csv'),
            configurable: true,
        });
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });

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
        mocks.getCriticalLowStockReportMock.mockResolvedValue({ success: true, data: [] });
        mocks.getOpenPurchaseOrdersReportMock.mockResolvedValue({ success: true, data: [] });
        mocks.getPendingShipmentsReportMock.mockResolvedValue({ success: true, data: [] });

        mocks.exportCashFlowMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'cash.xlsx' });
        mocks.exportLogisticsMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'logistics.xlsx' });
        mocks.exportTaxMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'tax.xlsx' });
        mocks.exportAttendanceSummaryMock.mockResolvedValue({ success: true, data: 'dGVzdA==', filename: 'attendance.xlsx' });
    });

    it('navega al reporte de ventas por producto con filtros canónicos', async () => {
        renderWithQueryClient(<ReportsPage />);

        const productSalesLink = await screen.findByRole('link', { name: /Ventas por Producto/i });
        const href = productSalesLink.getAttribute('href') || '';

        expect(href).toContain('/reports/sales-by-product?');
        expect(href).toContain('locationId=loc-1');
        expect(href).toContain('startDate=');
        expect(href).toContain('endDate=');
    });

    it('usa export logístico dedicado en vez del fallback de caja', async () => {
        renderWithQueryClient(<ReportsPage />);

        fireEvent.click(await screen.findByRole('button', { name: /Logística/i }));
        await screen.findByText(/Costo Inmovilizado/i);
        expect(screen.getByRole('button', { name: /Actualizar reportes/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Ver detalle de entradas/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Ver detalle de salidas/i })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Ver detalle de entradas/i }));
        await waitFor(() => {
            expect(mocks.getStockMovementsDetailMock).toHaveBeenCalledWith(
                'IN',
                expect.any(String),
                expect.any(String),
                'warehouse-1',
            );
        });
        fireEvent.click(screen.getByRole('button', { name: /Exportar/i }));

        await waitFor(() => {
            expect(mocks.exportLogisticsMock).toHaveBeenCalledWith({
                startDate: expect.any(String),
                endDate: expect.any(String),
                warehouseId: 'warehouse-1',
                movementType: 'IN',
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

    it('abre drill-down de recepciones WMS desde query params sin reutilizar el overview', async () => {
        mocks.searchParams = new URLSearchParams('tab=logistics&detail=receptions&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-query');
        mocks.getPendingShipmentsReportMock.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: 'ship-1',
                    type: 'INBOUND',
                    status: 'PENDING',
                    originLocationName: 'Proveedor',
                    destinationLocationName: 'Sucursal',
                    createdAt: '2026-04-02T00:00:00.000Z',
                    itemCount: 2,
                },
            ],
        });

        renderWithQueryClient(<ReportsPage />);

        await screen.findByText(/Shipments pendientes/i);

        await waitFor(() => {
            expect(mocks.getPendingShipmentsReportMock).toHaveBeenCalledWith('RECEPTIONS', {
                startDate: '2026-04-01',
                endDate: '2026-04-19',
                locationId: 'loc-query',
                warehouseId: 'warehouse-1',
            });
        });
        expect(await screen.findByText('INBOUND')).toBeTruthy();
    });

    it('mantiene contexto visible cuando llega desde una quick action operativa', async () => {
        mocks.searchParams = new URLSearchParams('tab=logistics&detail=transfers&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-query&warehouseId=wh-query&source=operational-suggestion&alertId=wms-pending-transfers');
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });

        renderWithQueryClient(<ReportsPage />);

        const banner = await screen.findByTestId('reports-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.accepted);
        expect(banner.textContent).toContain('Inspeccionar transferencias');
        expect(banner.textContent).toContain('No reintenta ni cambia estado WMS');
        expect(banner.textContent).toContain('Pestaña: Logística');
        expect(screen.getByTestId('reports-context-explanation').textContent).toContain(OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedFilters);
        expect(screen.getByTestId('reports-context-explanation').textContent).toContain('la URL no ejecuta acciones');
        expect(screen.getByTestId('reports-readiness-hint').textContent).toContain('Vista lista: Logística');
        await waitFor(() => {
            expect(emittedEvents).toEqual(expect.arrayContaining([
                'destination_opened',
                'destination_context_accepted',
            ]));
        });

        await waitFor(() => {
            expect(mocks.getPendingShipmentsReportMock).toHaveBeenCalledWith('TRANSFERS', {
                startDate: '2026-04-01',
                endDate: '2026-04-19',
                locationId: 'loc-query',
                warehouseId: 'wh-query',
            });
        });
    });

    it('rechaza contexto heredado con rango de fechas inválido sin ejecutar mutaciones ni exportar', async () => {
        mocks.searchParams = new URLSearchParams('tab=logistics&detail=transfers&startDate=bad&endDate=2026-04-19&locationId=loc-query&source=operational-suggestion&alertId=wms-pending-transfers');
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });

        renderWithQueryClient(<ReportsPage />);

        const banner = await screen.findByTestId('reports-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.rejected);
        expect(banner.textContent).toContain('filtros seguros');
        expect(screen.getByTestId('reports-context-explanation').textContent).toContain(OPERATIONAL_REJECTION_REASON_LABELS.invalid);
        expect(screen.getByTestId('reports-context-explanation').textContent).toContain('Rango de fechas inválido');
        expect(screen.getByTestId('reports-readiness-hint').textContent).toContain('Vista actual: Logística');

        await waitFor(() => {
            expect(emittedEvents).toEqual(expect.arrayContaining([
                'destination_opened',
                'destination_context_rejected',
            ]));
        });
        expect(mocks.exportCashFlowMock).not.toHaveBeenCalled();
        expect(mocks.exportLogisticsMock).not.toHaveBeenCalled();
        expect(mocks.exportTaxMock).not.toHaveBeenCalled();
    });

    it('consume acciones propias para inventario y procurement desde tabs de reportes', async () => {
        mocks.searchParams = new URLSearchParams('tab=inventory&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-query&warehouseId=wh-query');

        const { unmount } = renderWithQueryClient(<ReportsPage />);

        await waitFor(() => {
            expect(mocks.getCriticalLowStockReportMock).toHaveBeenCalledWith({
                locationId: 'loc-query',
                warehouseId: 'wh-query',
            });
        });

        unmount();
        mocks.searchParams = new URLSearchParams('tab=procurement&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-query&warehouseId=wh-query');

        renderWithQueryClient(<ReportsPage />);

        await waitFor(() => {
            expect(mocks.getOpenPurchaseOrdersReportMock).toHaveBeenCalledWith({
                startDate: '2026-04-01',
                endDate: '2026-04-19',
                locationId: 'loc-query',
                warehouseId: 'wh-query',
            });
        });
    });

    it('exporta CSV básico desde drill-down procurement sin recalcular datos', async () => {
        mocks.searchParams = new URLSearchParams('tab=procurement&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-query');
        mocks.getOpenPurchaseOrdersReportMock.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: 'po-1',
                    status: 'SENT',
                    supplierName: 'Proveedor 1',
                    totalAmount: 150000,
                    createdAt: '2026-04-02T10:00:00.000Z',
                    itemCount: 3,
                    warehouseName: 'Bodega 1',
                    locationName: 'Sucursal 1',
                },
            ],
        });

        renderWithQueryClient(<ReportsPage />);

        await screen.findByText('Proveedor 1');
        fireEvent.click(screen.getByRole('button', { name: /Exportar/i }));

        await waitFor(() => {
            expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
        });
        expect(window.URL.createObjectURL).toHaveBeenCalled();
    });

    it('aplica preset de transferencias pendientes sin abrir autoridad nueva', async () => {
        mocks.getPendingShipmentsReportMock.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: 'ship-preset-1',
                    type: 'TRANSFER',
                    status: 'IN_TRANSIT',
                    originLocationName: 'Sucursal 1',
                    destinationLocationName: 'Bodega 1',
                    createdAt: '2026-04-02T10:00:00.000Z',
                    itemCount: 4,
                },
            ],
        });

        renderWithQueryClient(<ReportsPage />);

        fireEvent.click(screen.getByTestId('reports-preset-wms-pending-transfers'));

        const appliedPreset = await screen.findByTestId('reports-applied-preset');
        expect(appliedPreset.textContent).toContain('Preset aplicado: Transferencias pendientes');
        expect(appliedPreset.textContent).toContain('Rango actual + ubicación/bodega');
        await waitFor(() => {
            expect(mocks.getPendingShipmentsReportMock).toHaveBeenCalledWith('TRANSFERS', {
                startDate: expect.any(String),
                endDate: expect.any(String),
                locationId: 'loc-1',
                warehouseId: 'warehouse-1',
            });
        });
        expect(mocks.exportCashFlowMock).not.toHaveBeenCalled();
        expect(mocks.exportLogisticsMock).not.toHaveBeenCalled();
        expect(mocks.exportTaxMock).not.toHaveBeenCalled();
    });

    it('exporta pack stock y abastecimiento reutilizando actions read-only existentes', async () => {
        mocks.getCriticalLowStockReportMock.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    productId: 'prod-low',
                    name: 'Producto bajo',
                    sku: 'SKU-LOW',
                    locationId: 'loc-1',
                    locationName: 'Sucursal 1',
                    warehouseId: 'warehouse-1',
                    warehouseName: 'Bodega 1',
                    quantity: 1,
                    stockMin: 5,
                    deficit: 4,
                },
            ],
        });
        mocks.getOpenPurchaseOrdersReportMock.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: 'po-open',
                    status: 'SENT',
                    supplierName: 'Proveedor 1',
                    totalAmount: 150000,
                    createdAt: '2026-04-02T10:00:00.000Z',
                    itemCount: 3,
                    warehouseName: 'Bodega 1',
                    locationName: 'Sucursal 1',
                },
            ],
        });
        mocks.getPendingShipmentsReportMock
            .mockResolvedValueOnce({
                success: true,
                data: [
                    {
                        id: 'ship-transfer',
                        type: 'TRANSFER',
                        status: 'IN_TRANSIT',
                        originLocationName: 'Sucursal 1',
                        destinationLocationName: 'Bodega 1',
                        createdAt: '2026-04-03T10:00:00.000Z',
                        itemCount: 2,
                        createdByName: 'Bodega',
                    },
                ],
            })
            .mockResolvedValueOnce({
                success: true,
                data: [
                    {
                        id: 'ship-reception',
                        type: 'INBOUND',
                        status: 'PENDING',
                        originLocationName: 'Proveedor',
                        destinationLocationName: 'Sucursal 1',
                        createdAt: '2026-04-04T10:00:00.000Z',
                        itemCount: 5,
                        createdByName: 'Compras',
                    },
                ],
            });

        renderWithQueryClient(<ReportsPage />);

        const exportPackButton = screen.getByTestId('reports-export-pack-stock-and-supply');
        expect(exportPackButton.className).toContain('min-h-11');
        fireEvent.click(exportPackButton);

        await waitFor(() => {
            expect(mocks.getCriticalLowStockReportMock).toHaveBeenCalledWith({
                locationId: 'loc-1',
                warehouseId: 'warehouse-1',
            });
            expect(mocks.getOpenPurchaseOrdersReportMock).toHaveBeenCalledWith({
                startDate: expect.any(String),
                endDate: expect.any(String),
                locationId: 'loc-1',
                warehouseId: 'warehouse-1',
            });
            expect(mocks.getPendingShipmentsReportMock).toHaveBeenCalledWith('TRANSFERS', {
                startDate: expect.any(String),
                endDate: expect.any(String),
                locationId: 'loc-1',
                warehouseId: 'warehouse-1',
            });
            expect(mocks.getPendingShipmentsReportMock).toHaveBeenCalledWith('RECEPTIONS', {
                startDate: expect.any(String),
                endDate: expect.any(String),
                locationId: 'loc-1',
                warehouseId: 'warehouse-1',
            });
        });
        expect(window.URL.createObjectURL).toHaveBeenCalledTimes(4);
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(4);
        expect(mocks.exportCashFlowMock).not.toHaveBeenCalled();
        expect(mocks.exportLogisticsMock).not.toHaveBeenCalled();
        expect(mocks.exportTaxMock).not.toHaveBeenCalled();
        expect(mocks.exportAttendanceSummaryMock).not.toHaveBeenCalled();
    });
});
