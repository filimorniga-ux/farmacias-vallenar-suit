/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InventoryDuplicates from '@/presentation/components/settings/InventoryDuplicates';
import {
    findDuplicateBarcodesSecure,
    findDuplicateBatchesSecure,
} from '@/actions/inventory-diagnostics-v2';

vi.mock('@/actions/inventory-diagnostics-v2', () => ({
    findDuplicateBatchesSecure: vi.fn(),
    findDuplicateBarcodesSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe('InventoryDuplicates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('consulta códigos de barras duplicados sin mostrar acciones de corrección', async () => {
        vi.mocked(findDuplicateBarcodesSecure).mockResolvedValueOnce({
            success: true,
            data: [
                {
                    barcode: '780000000001',
                    count: 2,
                    skus: ['SKU-1', 'SKU-2'],
                    names: ['Producto A', 'Producto B'],
                },
            ],
        });

        render(<InventoryDuplicates />);

        expect(screen.getByText('Solo lectura')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /buscar códigos duplicados/i }));

        await waitFor(() => {
            expect(findDuplicateBarcodesSecure).toHaveBeenCalledTimes(1);
        });

        expect(await screen.findAllByText('780000000001')).toHaveLength(2);
        expect(screen.getAllByText('Producto A').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /fusionar|corregir|eliminar/i })).toBeNull();
    });

    it('consulta lotes duplicados con criterios explícitos y mantiene el flujo read-only', async () => {
        vi.mocked(findDuplicateBatchesSecure).mockResolvedValueOnce({
            success: true,
            data: [
                {
                    sku: 'SKU-LOT',
                    name: 'Producto con lote',
                    lot_number: 'L-001',
                    count: 3,
                },
            ],
        });

        render(<InventoryDuplicates />);

        fireEvent.click(screen.getByRole('button', { name: /^lotes duplicados$/i }));
        fireEvent.click(screen.getByRole('button', { name: /buscar lotes duplicados/i }));

        await waitFor(() => {
            expect(findDuplicateBatchesSecure).toHaveBeenCalledWith({
                sku: true,
                lot: true,
                expiry: false,
                price: false,
            });
        });

        expect(screen.getAllByText('Producto con lote').length).toBeGreaterThan(0);
        expect(screen.getAllByText('POSIBLE DUPLICADO').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /fusionar|corregir|eliminar/i })).toBeNull();
    });
});
