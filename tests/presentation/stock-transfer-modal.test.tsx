/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockTransferModal from '@/presentation/components/inventory/StockTransferModal';
import type { InventoryBatch } from '@/domain/types';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        currentWarehouseId: 'wh-origin',
        currentLocationId: 'loc-1',
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
    };

    return {
        pharmaState,
        getWarehousesSecure: vi.fn(),
        executeTransferSecure: vi.fn(),
        toastSuccess: vi.fn(),
        toastError: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector?: (state: typeof mocks.pharmaState) => T) =>
        selector ? selector(mocks.pharmaState) : mocks.pharmaState,
}));

vi.mock('@/actions/locations-v2', () => ({
    getWarehousesSecure: (...args: unknown[]) => mocks.getWarehousesSecure(...args),
}));

vi.mock('@/actions/wms-v2', () => ({
    executeTransferSecure: (...args: unknown[]) => mocks.executeTransferSecure(...args),
}));

vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mocks.toastSuccess(...args),
        error: (...args: unknown[]) => mocks.toastError(...args),
    },
}));

describe('StockTransferModal', () => {
    const inventoryItems: InventoryBatch[] = [
        {
            id: 'batch-1',
            product_id: 'prod-1',
            sku: 'SKU-1',
            name: 'Paracetamol',
            location_id: 'loc-1',
            warehouse_id: 'wh-origin',
            stock_actual: 12,
            stock_min: 1,
            stock_max: 50,
            expiry_date: Date.now(),
            lot_number: 'LOT-1',
            cost_net: 100,
            tax_percent: 19,
            price_sell_box: 200,
            price_sell_unit: 20,
            price: 200,
            cost_price: 100,
            category: 'MEDICAMENTO',
            allows_commission: false,
            active_ingredients: [],
            concentration: '',
            unit_count: 1,
            is_generic: false,
            bioequivalent_status: 'NO_BIOEQUIVALENTE' as const,
            condition: 'VD' as const,
        },
        {
            id: 'batch-2',
            product_id: 'prod-1',
            sku: 'SKU-1',
            name: 'Paracetamol',
            location_id: 'loc-1',
            warehouse_id: 'wh-other',
            stock_actual: 8,
            stock_min: 1,
            stock_max: 50,
            expiry_date: Date.now(),
            lot_number: 'LOT-2',
            cost_net: 100,
            tax_percent: 19,
            price_sell_box: 200,
            price_sell_unit: 20,
            price: 200,
            cost_price: 100,
            category: 'MEDICAMENTO',
            allows_commission: false,
            active_ingredients: [],
            concentration: '',
            unit_count: 1,
            is_generic: false,
            bioequivalent_status: 'NO_BIOEQUIVALENTE' as const,
            condition: 'VD' as const,
        },
    ];

    const renderModal = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <StockTransferModal isOpen={true} onClose={vi.fn()} inventoryItems={inventoryItems} />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getWarehousesSecure.mockResolvedValue({
            success: true,
            data: [{ id: 'wh-dest', name: 'Bodega Destino' }],
        });
        mocks.executeTransferSecure.mockResolvedValue({ success: true, shipmentId: 'shipment-1' });
    });

    it('usa el snapshot de inventario entregado por la página y transfiere desde la bodega activa', async () => {
        renderModal();

        fireEvent.change(screen.getByPlaceholderText(/nombre o sku/i), {
            target: { value: 'para' },
        });

        fireEvent.click(await screen.findByRole('button', { name: /paracetamol/i }));

        const selects = await screen.findAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'wh-dest' } });
        fireEvent.change(selects[1], { target: { value: 'batch-1' } });
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });

        fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

        await waitFor(() => {
            expect(mocks.executeTransferSecure).toHaveBeenCalledWith({
                originWarehouseId: 'wh-origin',
                targetWarehouseId: 'wh-dest',
                items: [
                    {
                        productId: 'prod-1',
                        quantity: 3,
                        lotId: 'batch-1',
                    },
                ],
                userId: 'user-1',
            });
        });
    });

    it('mantiene shell móvil, safe area y controles táctiles sin enfocar automáticamente', async () => {
        renderModal();

        await waitFor(() => {
            expect(mocks.getWarehousesSecure).toHaveBeenCalledTimes(1);
        });

        const dialog = screen.getByRole('dialog', { name: /transferencia de stock/i });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.className).toContain('h-[calc(100dvh-1rem)]');

        const overlay = dialog.parentElement;
        expect(overlay?.className).toContain('safe-area-inset-top');
        expect(overlay?.className).toContain('safe-area-inset-bottom');
        expect(overlay?.className).toContain('items-start');

        expect(screen.getByRole('button', { name: /cerrar transferencia de stock/i }).className).toContain('min-h-11');

        const targetWarehouse = screen.getByLabelText('Destino');
        expect(targetWarehouse.className).toContain('min-h-11');
        expect(screen.getByText('Origen').closest('.grid')?.className).toContain('grid-cols-1');

        const searchInput = screen.getByLabelText('1. Buscar Producto');
        expect(searchInput.className).toContain('min-h-11');
        expect(searchInput.getAttribute('autofocus')).toBeNull();

        const footer = screen.getByRole('button', { name: 'Cancelar' }).parentElement;
        expect(footer?.className).toContain('flex-col');
        expect(screen.getByRole('button', { name: 'Cancelar' }).className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: /confirmar/i }).className).toContain('min-h-11');
    });
});
