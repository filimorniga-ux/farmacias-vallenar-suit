/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransferSuggestionsPanel from '@/presentation/components/supply/TransferSuggestionsPanel';
import { getTransferHistorySecure } from '@/actions/procurement-v2';
import { toast } from 'sonner';

vi.mock('@/actions/procurement-v2', () => ({
    getTransferHistorySecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock('@/presentation/components/supply/TransferExecutionModal', () => ({
    __esModule: true,
    default: ({ isOpen, items }: { isOpen: boolean; items: Array<{ sku: string; quantity: number }> }) => (
        isOpen ? (
            <div data-testid="transfer-execution-modal">
                {items.map((item) => (
                    <span key={item.sku}>{`${item.sku}:${item.quantity}`}</span>
                ))}
            </div>
        ) : null
    ),
}));

const mockGetTransferHistorySecure = vi.mocked(getTransferHistorySecure);

const baseSuggestions = [
    {
        product_name: 'Producto Sugerido',
        sku: 'SKU-001',
        current_stock: 2,
        suggested_order_qty: 10,
        action_type: 'TRANSFER',
        transfer_sources: [
            {
                location_id: 'source-1',
                location_name: 'Sucursal Norte',
                available_qty: 20,
            },
        ],
    },
];

const renderPanel = () => {
    render(
        <TransferSuggestionsPanel
            suggestions={baseSuggestions}
            targetLocationId="loc-1"
            targetLocationName="Sucursal Centro"
            onTransferComplete={vi.fn()}
            onGoBack={vi.fn()}
        />
    );
};

describe('TransferSuggestionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('carga historial al render y lo muestra sin interacción', async () => {
        mockGetTransferHistorySecure.mockResolvedValue({
            success: true,
            data: [
                {
                    transfer_id: 'tr-1',
                    executed_at: '2026-02-18T12:00:00.000Z',
                    from_location_name: 'Sucursal Norte',
                    to_location_name: 'Sucursal Centro',
                    quantity: 15,
                    items_count: 3,
                    executed_by: 'Manager',
                    reason: 'Reabastecimiento',
                },
            ],
        });

        renderPanel();

        await waitFor(() => {
            expect(mockGetTransferHistorySecure).toHaveBeenCalledWith({ locationId: 'loc-1', limit: 10 });
        });

        expect(await screen.findByText('Traslado masivo')).toBeTruthy();
        expect(screen.getByText('3 items')).toBeTruthy();
        expect(screen.getByText('Historial Reciente')).toBeTruthy();
    });

    it('muestra toast cuando la consulta responde success=false', async () => {
        mockGetTransferHistorySecure.mockResolvedValue({
            success: false,
            error: 'Fallo backend',
        });

        renderPanel();

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Fallo backend');
        });
    });

    it('renderiza historial arriba y mantiene la tabla de sugerencias', async () => {
        mockGetTransferHistorySecure.mockResolvedValue({
            success: true,
            data: [],
        });

        renderPanel();

        const historyTitle = await screen.findByText('Historial Reciente');
        const table = screen.getByRole('table');

        expect(screen.getByText('Producto Sugerido')).toBeTruthy();
        expect(screen.getByText('No hay traspasos registrados recientemente')).toBeTruthy();
        expect(
            historyTitle.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Historial Reciente/i })).toBeNull();
    });

    it('permite editar cantidad en A Traspasar respetando el disponible', async () => {
        mockGetTransferHistorySecure.mockResolvedValue({
            success: true,
            data: [],
        });

        renderPanel();

        const qtyInput = await screen.findByRole('spinbutton');
        expect((qtyInput as HTMLInputElement).value).toBe('10');

        fireEvent.change(qtyInput, { target: { value: '7' } });
        expect((qtyInput as HTMLInputElement).value).toBe('7');

        fireEvent.change(qtyInput, { target: { value: '' } });
        expect((qtyInput as HTMLInputElement).value).toBe('');

        fireEvent.change(qtyInput, { target: { value: '8' } });
        expect((qtyInput as HTMLInputElement).value).toBe('8');

        fireEvent.change(qtyInput, { target: { value: '25' } });
        expect((qtyInput as HTMLInputElement).value).toBe('20');
    });

    it('usa la cantidad editada al ejecutar un traspaso individual', async () => {
        mockGetTransferHistorySecure.mockResolvedValue({
            success: true,
            data: [],
        });

        renderPanel();

        const qtyInput = await screen.findByRole('spinbutton');
        fireEvent.change(qtyInput, { target: { value: '9' } });

        fireEvent.click(screen.getByRole('button', { name: /^Ejecutar$/i }));

        const modal = await screen.findByTestId('transfer-execution-modal');
        expect(modal.textContent).toContain('SKU-001:9');
    });
});
