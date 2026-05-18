/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductMappingDialog from '@/components/invoice/ProductMappingDialog';
import QuickProductCreate from '@/components/invoice/QuickProductCreate';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@/actions/invoice-parser-v2', () => ({
    searchProductsForMappingSecure: vi.fn(async () => ({ success: true, data: [] })),
}));

describe('ProductMappingDialog mobile layout', () => {
    it('mantiene la creación rápida dentro del viewport móvil', () => {
        render(
            <QuickProductCreate
                defaultName="Paracetamol 500mg comprimidos caja muy larga"
                defaultCost={1200}
                onCancel={vi.fn()}
                onCreated={vi.fn()}
            />
        );

        const panel = screen.getByTestId('quick-product-create-panel');
        expect(panel.className).toContain('w-full');
        expect(panel.className).toContain('max-w-lg');
        expect(panel.className).toContain('max-h-[calc(100dvh-2rem)]');
        expect(panel.className).toContain('overscroll-contain');
        expect(panel.className).not.toContain('w-[500px]');

        expect(screen.getByRole('button', { name: /Cancelar creación rápida/i }).className).toContain('min-h-11');
        expect(screen.getByLabelText('Nombre Comercial').className).toContain('min-h-11');
        expect(screen.getByLabelText('Precio de Venta (PVP)').className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: /Mostrar Detalles Farmacéuticos/i }).className).toContain('min-h-11');
    });

    it('usa safe areas y footer apilable en móvil al abrir desde el mapeo de factura', async () => {
        render(
            <ProductMappingDialog
                isOpen
                item={{
                    id: 'item-1',
                    description: 'Producto factura sin match',
                    quantity: 1,
                    unit_cost: 1000,
                    total_cost: 1000,
                    supplier_sku: 'SUP-001',
                } as any}
                onClose={vi.fn()}
                onProductSelected={vi.fn()}
                onSkip={vi.fn()}
            />
        );

        const dialog = screen.getByRole('dialog', { name: /Vincular Producto/i });
        expect(dialog.className).toContain('max-h-[calc(100dvh-1rem)]');
        expect(dialog.className).toContain('overflow-hidden');
        expect(dialog.parentElement?.className).toContain('safe-area-inset-top');
        expect(dialog.parentElement?.className).toContain('safe-area-inset-bottom');

        const search = screen.getByLabelText('Buscar producto por nombre o SKU');
        expect(search.className).toContain('min-h-11');

        await screen.findByText('No se encontraron productos');
        fireEvent.click(screen.getByRole('button', { name: /Crear nuevo producto/i }));

        expect(screen.getByRole('dialog', { name: /Crear Nuevo Producto/i })).toBeTruthy();
        expect(screen.getByTestId('quick-product-create-panel').className).toContain('w-full');
    });
});
