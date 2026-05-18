/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoidSaleModal from '@/presentation/components/pos/VoidSaleModal';

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/actions/sales-v2', () => ({
    voidSaleSecure: vi.fn(),
}));

import { voidSaleSecure } from '@/actions/sales-v2';

const mockVoidSale = vi.mocked(voidSaleSecure);

describe('VoidSaleModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exige motivo y PIN antes de anular una venta', () => {
        render(
            <VoidSaleModal
                isOpen
                onClose={vi.fn()}
                userId="user-1"
                onVoidComplete={vi.fn()}
                sale={{ id: 'sale-1', amount: 12000, dte_folio: 123 }}
            />
        );

        const button = screen.getByRole('button', { name: /confirmar anulación/i }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText(/cliente solicitó cancelar/i), {
            target: { value: 'Cliente solicitó anular la venta por error de cobro' },
        });
        fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } });

        expect(button.disabled).toBe(false);
    });

    it('llama voidSaleSecure y refresca al completar la anulación', async () => {
        mockVoidSale.mockResolvedValue({ success: true });
        const onClose = vi.fn();
        const onVoidComplete = vi.fn();

        render(
            <VoidSaleModal
                isOpen
                onClose={onClose}
                userId="user-1"
                onVoidComplete={onVoidComplete}
                sale={{ id: 'sale-2', amount: 5000 }}
            />
        );

        fireEvent.change(screen.getByPlaceholderText(/cliente solicitó cancelar/i), {
            target: { value: 'Cliente solicitó anular la venta por error de caja' },
        });
        fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '9999' } });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /confirmar anulación/i }));
        });

        await waitFor(() => {
            expect(mockVoidSale).toHaveBeenCalledWith({
                saleId: 'sale-2',
                userId: 'user-1',
                reason: 'Cliente solicitó anular la venta por error de caja',
                supervisorPin: '9999',
            });
            expect(onVoidComplete).toHaveBeenCalled();
            expect(onClose).toHaveBeenCalled();
        });
    });
});
