/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PriceCheckPage from '@/presentation/pages/PriceCheckPage';
import { InventoryBatch } from '@/domain/types';

const mocks = vi.hoisted(() => {
    const inventoryState: InventoryBatch[] = [];
    return {
        inventoryState,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        inventory: mocks.inventoryState,
    }),
}));

vi.mock('@/presentation/hooks/useBarcodeScanner', () => ({
    useBarcodeScanner: () => undefined,
}));

vi.mock('@/presentation/components/ui/CameraScanner', () => ({
    CameraScanner: ({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) => (
        <div data-testid="camera-scanner">
            <button onClick={() => onScan('BARCODE-OK')} data-testid="scan-valid">
                Escanear válido
            </button>
            <button onClick={() => onScan('BARCODE-NO-EXISTE')} data-testid="scan-invalid">
                Escanear inválido
            </button>
            <button onClick={onClose} data-testid="close-scanner">
                Cerrar
            </button>
        </div>
    ),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const makeBatch = (overrides: Partial<InventoryBatch>): InventoryBatch => ({
    id: 'prod-1',
    product_id: 'prod-1',
    sku: 'SKU-1',
    barcode: 'BARCODE-OK',
    name: 'Paracetamol 500mg',
    dci: 'paracetamol',
    laboratory: 'Laboratorio Test',
    format: 'Caja',
    concentration: '500mg',
    unit_count: 20,
    is_generic: true,
    bioequivalent_status: 'BIOEQUIVALENTE',
    condition: 'VD',
    location_id: 'loc-1',
    stock_actual: 15,
    stock_min: 1,
    stock_max: 200,
    expiry_date: Date.now() + 10_000_000,
    cost_net: 1000,
    tax_percent: 19,
    price_sell_box: 1500,
    price_sell_unit: 75,
    price: 1500,
    cost_price: 1000,
    category: 'MEDICAMENTOS',
    allows_commission: false,
    active_ingredients: ['Paracetamol'],
    ...overrides,
});

describe('PriceCheckPage - cámara scanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.inventoryState.length = 0;
        mocks.inventoryState.push(makeBatch({}));
    });

    it('abre scanner de cámara y muestra detalle al escanear un código válido', async () => {
        render(<PriceCheckPage />);

        fireEvent.click(screen.getByTitle('Escanear con cámara'));
        expect(screen.getByTestId('camera-scanner')).toBeTruthy();

        fireEvent.click(screen.getByTestId('scan-valid'));

        expect(await screen.findByText('Paracetamol 500mg')).toBeTruthy();
        expect(screen.queryByTestId('camera-scanner')).toBeNull();
    });

    it('mantiene scanner abierto cuando el código no existe en inventario', () => {
        render(<PriceCheckPage />);

        fireEvent.click(screen.getByTitle('Escanear con cámara'));
        expect(screen.getByTestId('camera-scanner')).toBeTruthy();

        fireEvent.click(screen.getByTestId('scan-invalid'));

        expect(screen.getByTestId('camera-scanner')).toBeTruthy();
        expect(screen.queryByText('Paracetamol 500mg')).toBeNull();
    });
});
