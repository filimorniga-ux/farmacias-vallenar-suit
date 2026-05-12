/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InventorySettings from '@/presentation/pages/settings/InventorySettings';

const clearInventoryMock = vi.fn();

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        clearInventory: clearInventoryMock,
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('InventorySettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    duplicates: [{ sku: 'SKU-1', count: '2', name: 'Producto Duplicado' }],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    mergedCount: 1,
                    message: 'Se fusionaron 1 productos correctamente.',
                }),
            }) as unknown as typeof fetch;
    });

    it('analiza duplicados sin exponer la fusión destructiva', async () => {
        render(<InventorySettings />);

        fireEvent.click(screen.getByRole('button', { name: /Analizar Duplicados/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/inventory/deduplicate',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
            }),
        );
        expect(screen.queryByRole('button', { name: /Fusionar Duplicados/i })).toBeNull();
        expect(screen.queryByPlaceholderText('FUSIONAR')).toBeNull();
    });

    it('usa el endpoint canónico de mantenimiento para vaciar inventario', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                message: 'Inventario vaciado correctamente.',
            }),
        }) as unknown as typeof fetch;

        render(<InventorySettings />);

        fireEvent.click(screen.getByRole('button', { name: /VACIAR TODO EL INVENTARIO/i }));
        fireEvent.change(screen.getByPlaceholderText('BORRAR'), {
            target: { value: 'BORRAR' },
        });
        fireEvent.change(screen.getByLabelText(/PIN administrador para mantenimiento de inventario/i), {
            target: { value: '1234' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Confirmar Borrado/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/inventory/maintenance',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR', adminPin: '1234' }),
                }),
            );
        });
        expect(clearInventoryMock).toHaveBeenCalledTimes(1);
    });

    it('usa el endpoint canónico de mantenimiento para revertir la última carga', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                message: 'Se revirtieron 2 lotes creados en los últimos 10 minutos.',
            }),
        }) as unknown as typeof fetch;

        render(<InventorySettings />);

        fireEvent.click(screen.getByRole('button', { name: /Deshacer Importación Reciente/i }));
        fireEvent.change(screen.getByLabelText(/PIN administrador para mantenimiento de inventario/i), {
            target: { value: '1234' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Autorizar Reversa/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/inventory/maintenance',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ action: 'UNDO_IMPORT', adminPin: '1234' }),
                }),
            );
        });
    });

    it('no ejecuta mantenimiento destructivo sin PIN administrador', async () => {
        render(<InventorySettings />);

        fireEvent.click(screen.getByRole('button', { name: /Deshacer Importación Reciente/i }));

        expect(screen.getByRole('button', { name: /Autorizar Reversa/i })).toHaveProperty('disabled', true);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
