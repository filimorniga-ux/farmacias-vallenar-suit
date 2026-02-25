/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManualOrderModal from '@/presentation/components/supply/ManualOrderModal';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        inventory: [],
        suppliers: [],
        addPurchaseOrder: vi.fn(),
        updatePurchaseOrder: vi.fn(),
        user: { id: '1719073d-9da1-40d7-9dce-28ac3a415a6b' },
        currentWarehouseId: '11111111-1111-4111-8111-111111111111',
        currentLocationId: '22222222-2222-4222-8222-222222222222',
    };

    return {
        pharmaState,
        onCloseMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => mocks.pharmaState,
}));

vi.mock('@/presentation/store/useNotificationStore', () => ({
    useNotificationStore: () => ({}),
}));

vi.mock('@/actions/notifications-v2', () => ({
    createNotificationSecure: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/actions/supply-v2', () => ({
    createPurchaseOrderSecure: vi.fn(async () => ({ success: true, orderId: 'PO-TEST' })),
    updatePurchaseOrderSecure: vi.fn(async () => ({ success: true, orderId: 'PO-TEST' })),
}));

vi.mock('@/actions/products-v2', () => ({
    updatePriceSecure: vi.fn(async () => ({ success: true })),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('ManualOrderModal', () => {
    it('no rompe cuando initialOrder llega sin items', () => {
        render(
            <ManualOrderModal
                isOpen
                onClose={mocks.onCloseMock}
                initialOrder={{
                    id: 'PO-LEGACY',
                    supplier_id: 'SUP-LEGACY',
                    destination_location_id: '22222222-2222-4222-8222-222222222222',
                    target_warehouse_id: '11111111-1111-4111-8111-111111111111',
                    created_at: Date.now(),
                    status: 'DRAFT',
                } as any}
            />
        );

        expect(screen.getByText('Editar Orden')).toBeTruthy();
        expect(screen.getByText(/carrito de compra/i)).toBeTruthy();
    });
});
