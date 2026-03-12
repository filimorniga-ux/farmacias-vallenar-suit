/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrderReceivingModal } from '@/presentation/components/scm/PurchaseOrderReceivingModal';
import { PurchaseOrder } from '@/domain/types';

const mocks = vi.hoisted(() => ({
    getHistoryItemDetailsSecureMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastWarningMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock('@/actions/supply-v2', () => ({
    getHistoryItemDetailsSecure: mocks.getHistoryItemDetailsSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        warning: mocks.toastWarningMock,
        error: mocks.toastErrorMock,
    },
}));

type TestOscillator = {
    type: string;
    connect: ReturnType<typeof vi.fn>;
    frequency: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
};

function installAudioContextMock() {
    const oscillators: TestOscillator[] = [];

    class MockAudioContext {
        currentTime = 0;
        destination = {};

        createOscillator() {
            const osc: TestOscillator = {
                type: '',
                connect: vi.fn(),
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                start: vi.fn(),
                stop: vi.fn(),
            };
            oscillators.push(osc);
            return osc as unknown as OscillatorNode;
        }

        createGain() {
            return {
                connect: vi.fn(),
                gain: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
            } as unknown as GainNode;
        }
    }

    Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: MockAudioContext,
    });

    return oscillators;
}

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

    it('autoenfoca input de escaneo e incrementa +1 por SKU con beep de éxito', async () => {
        const oscillators = installAudioContextMock();
        const order = buildOrder({
            items: [
                {
                    sku: 'SKU-SCAN-001',
                    name: 'Producto Escáner',
                    quantity_ordered: 2,
                    barcode: '7801111111111',
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

        const scannerInput = await screen.findByPlaceholderText('Escanea el código de barras o SKU del producto aquí...');
        expect(document.activeElement).toBe(scannerInput);

        fireEvent.change(scannerInput, { target: { value: 'sku-scan-001' } });
        fireEvent.keyDown(scannerInput, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(mocks.toastSuccessMock).toHaveBeenCalledWith('+1 Producto Escáner', { duration: 1500 });
        });

        const row = screen.getByText('Producto Escáner').closest('tr');
        expect(row).not.toBeNull();
        const qtyInput = within(row as HTMLElement).getByRole('spinbutton') as HTMLInputElement;
        expect(qtyInput.value).toBe('1');
        expect(oscillators.length).toBeGreaterThan(0);
        expect(oscillators.at(-1)?.type).toBe('sine');
    });

    it('acepta código de barras y emite beep de error si excede la cantidad esperada', async () => {
        const oscillators = installAudioContextMock();
        const order = buildOrder({
            items: [
                {
                    sku: 'SKU-SCAN-002',
                    name: 'Producto Código Barras',
                    quantity_ordered: 1,
                    barcode: '7802222222222',
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

        const scannerInput = await screen.findByPlaceholderText('Escanea el código de barras o SKU del producto aquí...');

        fireEvent.change(scannerInput, { target: { value: '7802222222222' } });
        fireEvent.keyDown(scannerInput, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(mocks.toastSuccessMock).toHaveBeenCalledWith('+1 Producto Código Barras', { duration: 1500 });
        });

        fireEvent.change(scannerInput, { target: { value: '7802222222222' } });
        fireEvent.keyDown(scannerInput, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(mocks.toastWarningMock).toHaveBeenCalledWith(
                'Ya recepcionaste la cantidad esperada de Producto Código Barras'
            );
        });

        expect(oscillators.length).toBeGreaterThanOrEqual(2);
        expect(oscillators.at(-1)?.type).toBe('sawtooth');
    });

    it('muestra error y beep grave cuando el código no pertenece a la orden', async () => {
        const oscillators = installAudioContextMock();
        const order = buildOrder({
            items: [
                {
                    sku: 'SKU-SCAN-003',
                    name: 'Producto Orden',
                    quantity_ordered: 1,
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

        const scannerInput = await screen.findByPlaceholderText('Escanea el código de barras o SKU del producto aquí...');
        fireEvent.change(scannerInput, { target: { value: 'NO-EXISTE-999' } });
        fireEvent.keyDown(scannerInput, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(mocks.toastErrorMock).toHaveBeenCalledWith('El código no-existe-999 no pertenece a esta orden.');
        });
        expect(oscillators.length).toBeGreaterThan(0);
        expect(oscillators.at(-1)?.type).toBe('sawtooth');
    });
});
