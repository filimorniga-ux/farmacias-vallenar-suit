/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryExportForm } from '@/presentation/components/reports/InventoryExportForm';

const mocks = vi.hoisted(() => {
    const storeState = {
        user: { role: 'MANAGER' },
        currentLocationId: 'loc-1',
    };

    return {
        storeState,
        getLocationsSecureMock: vi.fn(),
        getWarehousesByLocationSecureMock: vi.fn(),
        exportInventoryReportSecureMock: vi.fn(),
        exportStockMovementsSecureMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => mocks.storeState,
}));

vi.mock('@/actions/locations-v2', () => ({
    getLocationsSecure: mocks.getLocationsSecureMock,
    getWarehousesByLocationSecure: mocks.getWarehousesByLocationSecureMock,
}));

vi.mock('@/actions/inventory-export-v2', () => ({
    exportInventoryReportSecure: mocks.exportInventoryReportSecureMock,
    exportStockMovementsSecure: mocks.exportStockMovementsSecureMock,
}));

describe('InventoryExportForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getLocationsSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'loc-1', name: 'Sucursal Centro' }],
        });
        mocks.getWarehousesByLocationSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'wh-1', name: 'Bodega Principal' }],
        });
        mocks.exportInventoryReportSecureMock.mockResolvedValue({
            success: true,
            data: 'dGVzdA==',
            filename: 'inventario.xlsx',
        });
        mocks.exportStockMovementsSecureMock.mockResolvedValue({
            success: true,
            data: 'dGVzdA==',
            filename: 'kardex.xlsx',
        });

        Object.defineProperty(window, 'atob', {
            value: (value: string) => Buffer.from(value, 'base64').toString('binary'),
            configurable: true,
        });
        Object.defineProperty(window.URL, 'createObjectURL', {
            value: vi.fn(() => 'blob:inventory-export'),
            configurable: true,
        });
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('export snapshot calls only the inventory snapshot action', async () => {
        render(<InventoryExportForm />);

        expect(screen.getByText('Inventario actual: stock vigente por producto y lote.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Exportar inventario actual' }));

        await waitFor(() => {
            expect(mocks.exportInventoryReportSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.exportInventoryReportSecureMock).toHaveBeenCalledWith({
            locationId: undefined,
            warehouseId: undefined,
            type: 'seed',
        });
        expect(mocks.exportStockMovementsSecureMock).not.toHaveBeenCalled();
    });

    it('export kardex calls only the stock movements action with an explicit date range', async () => {
        render(<InventoryExportForm />);

        fireEvent.click(screen.getByRole('button', { name: 'Kardex Histórico' }));
        fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-04-01' } });
        fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-04-24' } });
        fireEvent.click(screen.getByRole('button', { name: 'Exportar kardex histórico' }));

        await waitFor(() => {
            expect(mocks.exportStockMovementsSecureMock).toHaveBeenCalledTimes(1);
        });

        expect(mocks.exportStockMovementsSecureMock).toHaveBeenCalledWith({
            startDate: '2026-04-01',
            endDate: '2026-04-24',
            locationId: undefined,
            limit: 5000,
        });
        expect(mocks.exportInventoryReportSecureMock).not.toHaveBeenCalled();
    });

    it('requires a valid kardex date range before exporting', async () => {
        render(<InventoryExportForm />);

        fireEvent.click(screen.getByRole('button', { name: 'Kardex Histórico' }));
        fireEvent.click(screen.getByRole('button', { name: 'Exportar kardex histórico' }));

        expect((await screen.findByRole('alert')).textContent).toContain('Seleccione un rango de fechas válido para exportar el kardex.');
        expect(mocks.exportInventoryReportSecureMock).not.toHaveBeenCalled();
        expect(mocks.exportStockMovementsSecureMock).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-04-24' } });
        fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-04-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Exportar kardex histórico' }));

        expect((await screen.findByRole('alert')).textContent).toContain('La fecha Desde no puede ser posterior a la fecha Hasta.');
        expect(mocks.exportInventoryReportSecureMock).not.toHaveBeenCalled();
        expect(mocks.exportStockMovementsSecureMock).not.toHaveBeenCalled();
    });

    it('mantiene tabs, filtros y acción de exportación táctiles en móvil', async () => {
        render(<InventoryExportForm />);

        await waitFor(() => {
            expect(mocks.getLocationsSecureMock).toHaveBeenCalledTimes(1);
        });

        const snapshotTab = screen.getByRole('button', { name: 'Inventario Actual' });
        const kardexTab = screen.getByRole('button', { name: 'Kardex Histórico' });
        expect(snapshotTab.parentElement?.className).toContain('grid-cols-1');
        expect(snapshotTab.parentElement?.className).toContain('sm:grid-cols-2');
        expect(snapshotTab.className).toContain('min-h-11');
        expect(snapshotTab.getAttribute('aria-pressed')).toBe('true');
        expect(kardexTab.className).toContain('min-h-11');

        fireEvent.click(kardexTab);

        const startDate = screen.getByLabelText('Desde');
        const endDate = screen.getByLabelText('Hasta');
        expect(startDate.closest('.grid')?.className).toContain('grid-cols-1');
        expect(startDate.closest('.grid')?.className).toContain('sm:grid-cols-2');
        expect(startDate.className).toContain('min-h-11');
        expect(endDate.className).toContain('min-h-11');

        expect(screen.getByLabelText('Sucursal').className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: 'Exportar kardex histórico' }).className).toContain('min-h-11');
    });
});
