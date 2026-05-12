/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WMSReportPanel } from '@/presentation/components/wms/WMSReportPanel';
import { getStockHistorySecure } from '@/actions/wms-v2';

const reportMovement = {
    id: 'movement-1',
    sku: 'SKU-1',
    product_name: 'Producto Test',
    movement_type: 'PURCHASE_ENTRY',
    quantity: 1,
    stock_before: 0,
    stock_after: 1,
    timestamp: '2026-01-15T12:00:00.000Z',
    user_name: 'Operador Test',
};

vi.mock('@/actions/wms-v2', () => ({
    getStockHistorySecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

describe('WMSReportPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getStockHistorySecure).mockResolvedValue({
            success: true,
            data: {
                movements: [],
                total: 0,
                page: 1,
                pageSize: 50,
            },
        });
    });

    it('envía invoiceNumber al historial WMS cuando el reporte aplica a pedidos', async () => {
        render(
            <WMSReportPanel
                activeTab="PEDIDOS"
                locationId="loc-1"
                onClose={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Nº Factura'), {
            target: { value: 'FAC-123' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Buscar/i }));

        await waitFor(() => {
            expect(getStockHistorySecure).toHaveBeenCalledTimes(2);
        });

        for (const call of vi.mocked(getStockHistorySecure).mock.calls) {
            expect(call[0]).toMatchObject({
                warehouseId: 'loc-1',
                invoiceNumber: 'FAC-123',
                page: 1,
                pageSize: 50,
            });
        }
    });

    it('no expone filtro de factura ni envía invoiceNumber fuera de pedidos', async () => {
        render(
            <WMSReportPanel
                activeTab="DESPACHO"
                locationId="loc-1"
                onClose={vi.fn()}
            />
        );

        expect(screen.queryByLabelText('Nº Factura')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Buscar/i }));

        await waitFor(() => {
            expect(getStockHistorySecure).toHaveBeenCalledTimes(2);
        });

        for (const call of vi.mocked(getStockHistorySecure).mock.calls) {
            expect(call[0]).not.toHaveProperty('invoiceNumber', expect.any(String));
        }
    });

    it('muestra rango y total de páginas usando totalResults sin depender del largo de resultados', async () => {
        vi.mocked(getStockHistorySecure).mockImplementation(async (filters) => ({
            success: true,
            data: {
                movements: [reportMovement],
                total: 75,
                page: filters.page ?? 1,
                pageSize: filters.pageSize ?? 50,
            },
        }));
        const onExportExcel = vi.fn().mockResolvedValue(undefined);

        render(
            <WMSReportPanel
                activeTab="PEDIDOS"
                locationId="loc-1"
                onClose={vi.fn()}
                onExportExcel={onExportExcel}
            />
        );

        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'PURCHASE_ENTRY' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Buscar/i }));

        expect(await screen.findByText('Página 1 de 2')).toBeTruthy();
        expect(screen.getByText('Mostrando 1-50 de 75 registros')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

        expect(await screen.findByText('Página 2 de 2')).toBeTruthy();
        expect(screen.getByText('Mostrando 51-75 de 75 registros')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /Excel/i }));

        await waitFor(() => {
            expect(onExportExcel).toHaveBeenCalledWith(expect.objectContaining({
                movementType: 'PURCHASE_ENTRY',
                page: 2,
                pageSize: 50,
            }));
        });
    });

    it('aclara que la impresión solo usa la página visible sin alterar búsqueda ni export', async () => {
        vi.mocked(getStockHistorySecure).mockResolvedValue({
            success: true,
            data: {
                movements: [reportMovement],
                total: 1,
                page: 1,
                pageSize: 50,
            },
        });
        const onExportExcel = vi.fn().mockResolvedValue(undefined);

        render(
            <WMSReportPanel
                activeTab="PEDIDOS"
                locationId="loc-1"
                onClose={vi.fn()}
                onExportExcel={onExportExcel}
            />
        );

        expect(screen.getByRole('button', { name: /Imprimir página visible/i })).toBeTruthy();
        expect(screen.getByText('La impresión incluye solo los resultados visibles en esta página.')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nº Factura'), {
            target: { value: 'FAC-456' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Buscar/i }));

        await screen.findAllByText('Producto Test');

        expect(getStockHistorySecure).toHaveBeenCalledTimes(2);
        for (const call of vi.mocked(getStockHistorySecure).mock.calls) {
            expect(call[0]).toMatchObject({
                warehouseId: 'loc-1',
                invoiceNumber: 'FAC-456',
                page: 1,
                pageSize: 50,
            });
        }

        fireEvent.click(screen.getByRole('button', { name: /Excel/i }));

        await waitFor(() => {
            expect(onExportExcel).toHaveBeenCalledWith(expect.objectContaining({
                invoiceNumber: 'FAC-456',
                page: 1,
                pageSize: 50,
            }));
        });
    });
});
