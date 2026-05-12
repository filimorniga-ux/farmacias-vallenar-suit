/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AddSupplierModal from '@/presentation/components/suppliers/AddSupplierModal';

describe('AddSupplierModal mobile layout', () => {
    it('usa diálogo accesible, safe areas y controles táctiles en móvil', () => {
        render(
            <AddSupplierModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
            />
        );

        const dialog = screen.getByRole('dialog', { name: /nuevo proveedor/i });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.className).toContain('h-[calc(100dvh-1rem)]');

        const overlay = dialog.parentElement;
        expect(overlay?.className).toContain('safe-area-inset-top');
        expect(overlay?.className).toContain('safe-area-inset-bottom');
        expect(overlay?.className).toContain('items-start');

        expect(screen.getByRole('button', { name: /cerrar formulario de proveedor/i }).className).toContain('min-h-11');
        expect(screen.getByPlaceholderText('12.345.678-9').className).toContain('min-h-11');
        expect(screen.getByPlaceholderText('Laboratorios Chile S.A.').className).toContain('min-h-11');
        expect(screen.getAllByRole('combobox')[0].className).toContain('min-h-11');

        const brandInput = screen.getByPlaceholderText('Escribe una marca y presiona Enter o Espacio');
        expect(brandInput.className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: /agregar/i }).className).toContain('min-h-11');

        const footer = screen.getByText(/Campos obligatorios/i).parentElement;
        expect(footer?.className).toContain('flex-col');
        expect(screen.getByRole('button', { name: 'Cancelar' }).className).toContain('min-h-11');
        expect(screen.getByRole('button', { name: 'Guardar Proveedor' }).className).toContain('min-h-11');
    });
});
