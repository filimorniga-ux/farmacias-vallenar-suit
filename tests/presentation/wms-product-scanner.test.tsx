/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WMSProductScanner } from '@/presentation/components/wms/WMSProductScanner';
import { InventoryBatch } from '@/domain/types';

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({ isMobile: false }),
}));

vi.mock('@/components/shared/MobileScanner', () => ({
    MobileScanner: () => null,
}));

const makeBatch = (overrides: Partial<InventoryBatch>): InventoryBatch => ({
    id: 'batch-default',
    product_id: 'product-default',
    sku: '50003',
    name: 'AARTAM METRONIDAZOL 500MG X20 COMP. LAB. PINNACLE B',
    concentration: '',
    unit_count: 1,
    is_generic: false,
    bioequivalent_status: 'NO_BIOEQUIVALENTE',
    condition: 'VD',
    location_id: 'loc-1',
    stock_actual: 1,
    stock_min: 0,
    stock_max: 9999,
    expiry_date: Date.now() + 86400000,
    cost_net: 100,
    tax_percent: 19,
    price_sell_box: 100,
    price_sell_unit: 100,
    price: 100,
    cost_price: 100,
    category: 'MEDICAMENTOS',
    allows_commission: false,
    active_ingredients: [],
    ...overrides,
});

describe('WMSProductScanner', () => {
    it('muestra producto original y variante [AL DETAL] cuando comparten SKU', async () => {
        const onProductSelected = vi.fn();

        const inventory: InventoryBatch[] = [
            makeBatch({
                id: 'detail-batch',
                product_id: 'product-aartam',
                sku: '50003',
                name: '[AL DETAL] AARTAM METRONIDAZOL 500MG X20 COMP. LAB. PINNACLE B',
                stock_actual: 20,
                is_retail_lot: true,
            }),
            makeBatch({
                id: 'standard-batch',
                product_id: 'product-aartam',
                sku: '50003',
                name: 'AARTAM METRONIDAZOL 500MG X20 COMP. LAB. PINNACLE B',
                stock_actual: 16,
                is_retail_lot: false,
            }),
        ];

        render(
            <WMSProductScanner
                inventory={inventory}
                onProductSelected={onProductSelected}
                autoFocus={false}
            />
        );

        const input = screen.getByPlaceholderText('Escanear código o buscar producto...') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'aar' } });

        expect(await screen.findByText('[AL DETAL] AARTAM METRONIDAZOL 500MG X20 COMP. LAB. PINNACLE B')).toBeTruthy();
        expect(screen.getByText('AARTAM METRONIDAZOL 500MG X20 COMP. LAB. PINNACLE B')).toBeTruthy();
    });
});

