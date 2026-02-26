/**
 * @vitest-environment jsdom
 *
 * Tests for EditSaleModal component
 *
 * Covers:
 * - Renderiza el step EDIT_ITEMS con ítems de la venta
 * - Muestra advertencia DTE cuando la venta tiene folio
 * - El botón Continuar está deshabilitado sin motivo suficiente
 * - Transiciona a PIN_AUTH al completar el formulario
 * - El botón Volver regresa a EDIT_ITEMS
 * - Muestra SUCCESS tras llamada exitosa a editSaleSecure
 * - Muestra error en PIN_AUTH cuando el backend rechaza el PIN
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EditSaleModal from '@/presentation/components/pos/EditSaleModal';

// =====================================================
// MOCKS
// =====================================================

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/actions/sales-v2', () => ({
    editSaleSecure: vi.fn(),
}));

vi.mock('@/actions/search-actions', () => ({
    searchProductsForEditSecure: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

import { editSaleSecure } from '@/actions/sales-v2';
const mockEditSale = vi.mocked(editSaleSecure);

// =====================================================
// FIXTURES
// =====================================================

const SALE_ID = '11111111-1111-4111-8111-111111111111';

const makeSale = (overrides: Record<string, unknown> = {}) => ({
    id: SALE_ID,
    type: 'SALE',
    timestamp: Date.now(),
    amount: 3000,
    payment_method: 'CASH',
    user_name: 'Cajero Test',
    customer_name: 'Cliente',
    status: 'COMPLETED',
    dte_folio: null,
    items: [
        {
            batch_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            name: 'Paracetamol 500mg',
            quantity: 2,
            unit_price: 1500,
        },
    ],
    ...overrides,
});

const DEFAULT_PROPS = {
    isOpen: true,
    onClose: vi.fn(),
    sale: makeSale() as any,
    locationId: 'loc-1',
    userId: 'user-1',
    onEditComplete: vi.fn(),
};

// =====================================================
// TESTS
// =====================================================

describe('EditSaleModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renderiza el step EDIT_ITEMS con los ítems de la venta', () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);

        expect(screen.getByText('Editar Venta')).toBeTruthy();
        expect(screen.getByText('Paracetamol 500mg')).toBeTruthy();
        expect(screen.getByText('Ítems de la venta')).toBeTruthy();
    });

    it('muestra advertencia DTE cuando la venta tiene folio', () => {
        const props = { ...DEFAULT_PROPS, sale: makeSale({ dte_folio: 12345 }) as any };
        render(<EditSaleModal {...props} />);

        expect(screen.getByText(/DTE emitido/i)).toBeTruthy();
        expect(screen.getByText(/12345/)).toBeTruthy();
    });

    it('no muestra advertencia DTE cuando la venta no tiene folio', () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);
        expect(screen.queryByText(/DTE emitido/i)).toBeNull();
    });

    it('botón Continuar está deshabilitado sin motivo', () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);
        const btn = screen.getByRole('button', { name: /continuar/i }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it('botón Continuar se habilita cuando hay cambios y motivo suficiente', async () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);

        // Cambiar cantidad para generar un cambio
        const qtyInputs = screen.getAllByDisplayValue('2');
        fireEvent.change(qtyInputs[0], { target: { value: '5' } });

        // Ingresar motivo suficiente
        const textarea = screen.getByPlaceholderText(/cajero ingresó/i);
        fireEvent.change(textarea, { target: { value: 'Este es el motivo de corrección del error del cajero.' } });

        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /continuar/i }) as HTMLButtonElement;
            expect(btn.disabled).toBe(false);
        });
    });

    it('transiciona a PIN_AUTH al hacer click en Continuar con datos válidos', async () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);

        const qtyInputs = screen.getAllByDisplayValue('2');
        fireEvent.change(qtyInputs[0], { target: { value: '5' } });

        const textarea = screen.getByPlaceholderText(/cajero ingresó/i);
        fireEvent.change(textarea, { target: { value: 'Este es el motivo de corrección del error del cajero.' } });

        const btn = screen.getByRole('button', { name: /continuar/i });
        await act(async () => fireEvent.click(btn));

        expect(screen.getByText('Autorización requerida')).toBeTruthy();
        expect(screen.getByRole('button', { name: /autorizar/i })).toBeTruthy();
    });

    it('volver desde PIN_AUTH regresa a EDIT_ITEMS', async () => {
        render(<EditSaleModal {...DEFAULT_PROPS} />);

        // Avanzar a PIN_AUTH
        const qtyInputs = screen.getAllByDisplayValue('2');
        fireEvent.change(qtyInputs[0], { target: { value: '5' } });
        const textarea = screen.getByPlaceholderText(/cajero ingresó/i);
        fireEvent.change(textarea, { target: { value: 'Motivo de corrección completo para el sistema.' } });
        const continuar = screen.getByRole('button', { name: /continuar/i });
        await act(async () => fireEvent.click(continuar));

        // Volver
        const volverBtn = screen.getByRole('button', { name: /volver/i });
        fireEvent.click(volverBtn);

        await waitFor(() => {
            expect(screen.getByText('Ítems de la venta')).toBeTruthy();
        });
    });

    it('muestra SUCCESS tras llamada exitosa', async () => {
        mockEditSale.mockResolvedValue({ success: true, newTotal: 7500 });

        render(<EditSaleModal {...DEFAULT_PROPS} />);

        // Avanzar a PIN_AUTH
        const qtyInputs = screen.getAllByDisplayValue('2');
        fireEvent.change(qtyInputs[0], { target: { value: '5' } });
        const textarea = screen.getByPlaceholderText(/cajero ingresó/i);
        fireEvent.change(textarea, { target: { value: 'Motivo de corrección completo para el sistema.' } });
        await act(async () => fireEvent.click(screen.getByRole('button', { name: /continuar/i })));

        // Rellenar PIN (los inputs son type="password", no tienen rol "textbox")
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach((input, idx) => {
            if (idx < 4) fireEvent.change(input, { target: { value: String(idx + 1) } });
        });

        // Autorizar
        await act(async () => fireEvent.click(screen.getByRole('button', { name: /autorizar/i })));

        await waitFor(() => {
            expect(screen.getByText(/corregida exitosamente/i)).toBeTruthy();
            // El total se formatea con toLocaleString — acepta coma o punto como separador
            expect(screen.getByText(/7.500|7,500/)).toBeTruthy();
        });
    });

    it('muestra error de PIN inválido en PIN_AUTH sin cambiar de step', async () => {
        mockEditSale.mockResolvedValue({ success: false, error: 'PIN de autorización inválido' });

        render(<EditSaleModal {...DEFAULT_PROPS} />);

        // Avanzar a PIN_AUTH
        const qtyInputs = screen.getAllByDisplayValue('2');
        fireEvent.change(qtyInputs[0], { target: { value: '5' } });
        const textarea = screen.getByPlaceholderText(/cajero ingresó/i);
        fireEvent.change(textarea, { target: { value: 'Motivo de corrección completo para el sistema.' } });
        await act(async () => fireEvent.click(screen.getByRole('button', { name: /continuar/i })));

        // Rellenar PIN (type="password", no tienen rol "textbox")
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach((input, idx) => {
            if (idx < 4) fireEvent.change(input, { target: { value: String(idx + 1) } });
        });

        await act(async () => fireEvent.click(screen.getByRole('button', { name: /autorizar/i })));

        await waitFor(() => {
            expect(screen.getByText(/PIN de autorización inválido/i)).toBeTruthy();
            // Sigue en PIN_AUTH
            expect(screen.getByRole('button', { name: /autorizar/i })).toBeTruthy();
        });
    });

    it('no renderiza nada cuando isOpen es false', () => {
        const { container } = render(<EditSaleModal {...DEFAULT_PROPS} isOpen={false} />);
        expect(container.firstChild).toBeNull();
    });
});
