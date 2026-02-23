/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrderReceivingModal } from '@/presentation/components/scm/PurchaseOrderReceivingModal';
import { PurchaseOrder } from '@/domain/types';

const mocks = vi.hoisted(() => ({
    getHistoryItemDetailsSecureMock: vi.fn(),
    toastWarningMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock('@/actions/supply-v2', () => ({
    getHistoryItemDetailsSecure: mocks.getHistoryItemDetailsSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        warning: mocks.toastWarningMock,
        error: mocks.toastErrorMock,
    },
}));

function buildOrder(overrides: Record<string, unknown> = {}): PurchaseOrder {
    return {
        id: '550e8400-e29b-41d4-a716-446655440999',
        supplier_id: 'SUP-1',
        destination_location_id: 'LOC-1',
        target_warehouse_id: '550e8400-e29b-41d4-a716-446655440111',
        created_at: Date.now(),
        status: 'DRAFT',
        items: [],
        ...overrides,
    } as PurchaseOrder;
}

describe('PurchaseOrderReceivingModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getHistoryItemDetailsSecureMock.mockResolvedValue({ success: true, data: [] });
    });

    it('renderiza ítems desde line_items sin romper cuando order.items es undefined', async () => {
        const order = buildOrder({
            items: undefined,
            line_items: [
                {
                    sku: 'SKU-LINE-1',
                    name: 'Producto Line',
                    quantity_ordered: 4,
                },
            ],
        });

        render(
            <PurchaseOrderReceivingModal
                isOpen
                order={order}
                onReceive={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(await screen.findByText('Producto Line')).toBeTruthy();
        expect(screen.getByText('SKU-LINE-1')).toBeTruthy();
    });

    it('carga detalle desde backend cuando la orden no trae ítems', async () => {
        const order = buildOrder({ items: undefined });
        mocks.getHistoryItemDetailsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    sku: 'SKU-API-1',
                    name: 'Producto API',
                    quantity: 3,
                },
            ],
        });

        render(
            <PurchaseOrderReceivingModal
                isOpen
                order={order}
                onReceive={vi.fn()}
                onClose={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(mocks.getHistoryItemDetailsSecureMock).toHaveBeenCalledWith(order.id, 'PO');
        });
        expect(await screen.findByText('Producto API')).toBeTruthy();
    });

    it('deshabilita confirmar cuando no existen ítems para recepcionar', async () => {
        const order = buildOrder({ items: undefined });

        render(
            <PurchaseOrderReceivingModal
                isOpen
                order={order}
                onReceive={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(await screen.findByText('Esta orden no tiene ítems disponibles.')).toBeTruthy();
        const confirmButton = screen.getByRole('button', { name: /confirmar recepción/i });
        expect(confirmButton.hasAttribute('disabled')).toBe(true);
        fireEvent.click(confirmButton);
        expect(mocks.toastWarningMock).not.toHaveBeenCalled();
    });
});
