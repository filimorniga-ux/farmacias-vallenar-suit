/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnsModal from '@/presentation/components/pos/ReturnsModal';

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/actions/sales-v2', () => ({
    refundSaleSecure: vi.fn(),
}));

import { refundSaleSecure } from '@/actions/sales-v2';

const mockRefund = vi.mocked(refundSaleSecure);

describe('ReturnsModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('procesa devolución completa y ejecuta callback de refresco', async () => {
        mockRefund.mockResolvedValue({ success: true, refundId: 'ref-1', refundAmount: 12000 });

        const onClose = vi.fn();
        const onRefundComplete = vi.fn();

        render(
            <ReturnsModal
                isOpen={true}
                onClose={onClose}
                userId="user-1"
                onRefundComplete={onRefundComplete}
                sale={{
                    id: 'sale-1',
                    type: 'SALE',
                    timestamp: new Date(),
                    amount: 12000,
                    payment_method: 'CASH',
                    status: 'COMPLETED',
                    items: [
                        {
                            sale_item_id: 'si-1',
                            quantity: 3,
                            refunded_quantity: 0,
                            name: 'Producto A',
                        },
                    ],
                }}
            />
        );

        fireEvent.change(
            screen.getByPlaceholderText(/Producto dañado/i),
            { target: { value: 'Cliente solicitó devolución por error de cobro' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));

        const pinInput = screen.getByPlaceholderText('••••');
        fireEvent.change(pinInput, { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Confirmar Devolución/i }));
        });

        await waitFor(() => {
            expect(mockRefund).toHaveBeenCalledWith({
                saleId: 'sale-1',
                userId: 'user-1',
                supervisorPin: '1234',
                reason: 'Cliente solicitó devolución por error de cobro',
                items: [{ saleItemId: 'si-1', quantity: 3 }],
                refundMethod: 'CASH',
            });
            expect(onRefundComplete).toHaveBeenCalled();
            expect(onClose).toHaveBeenCalled();
        });
    });

    it('permite escoger transferencia como medio de devolución', async () => {
        mockRefund.mockResolvedValue({ success: true, refundId: 'ref-2', refundAmount: 5000 });

        render(
            <ReturnsModal
                isOpen={true}
                onClose={vi.fn()}
                userId="user-2"
                onRefundComplete={vi.fn()}
                sale={{
                    id: 'sale-2',
                    type: 'SALE',
                    timestamp: new Date(),
                    amount: 5000,
                    payment_method: 'CASH',
                    status: 'COMPLETED',
                    items: [{ sale_item_id: 'si-2', quantity: 1, refunded_quantity: 0, name: 'Producto B' }],
                }}
            />
        );

        fireEvent.change(
            screen.getByPlaceholderText(/Producto dañado/i),
            { target: { value: 'Devolución autorizada por diferencia en cobro' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Transferencia/i }));
        fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
        fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Confirmar Devolución/i }));
        });

        await waitFor(() => {
            expect(mockRefund).toHaveBeenCalledWith(expect.objectContaining({
                saleId: 'sale-2',
                refundMethod: 'TRANSFER',
            }));
        });
    });
});
