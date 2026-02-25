/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WMSTransitoTab from '@/presentation/components/wms/tabs/WMSTransitoTab';

type PharmaState = {
    currentLocationId: string;
    shipments: unknown[];
    purchaseOrders: unknown[];
    refreshShipments: (locationId?: string) => Promise<void>;
    refreshPurchaseOrders: (locationId?: string) => Promise<void>;
};

const mocks = vi.hoisted(() => {
    const state: PharmaState = {
        currentLocationId: 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6',
        shipments: [],
        purchaseOrders: [],
        refreshShipments: vi.fn(async () => {}),
        refreshPurchaseOrders: vi.fn(async () => {}),
    };

    const usePharmaStoreMock = Object.assign(
        () => state,
        { getState: () => state }
    );

    return {
        state,
        usePharmaStoreMock,
        toastErrorMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('sonner', () => ({
    toast: {
        error: mocks.toastErrorMock,
    },
}));

describe('WMSTransitoTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.state.currentLocationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';
        mocks.state.shipments = [];
        mocks.state.purchaseOrders = [];
        mocks.state.refreshShipments = vi.fn(async () => {});
        mocks.state.refreshPurchaseOrders = vi.fn(async () => {});
    });

    it('muestra en transito una OC del kanban (ORDERED/SENT)', async () => {
        mocks.state.purchaseOrders = [
            {
                id: '63592c1c-abb9-4325-82f5-67cd1d8d535f',
                status: 'ORDERED',
                notes: '[TRANSFER_REQUEST] Traspaso | ORIGEN:Farmacia prat(aaaa1111-1111-4111-8111-111111111111) | DESTINO:Farmacia Vallenar santiago(bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6)',
                location_id: 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6',
                location_name: 'Farmacia Vallenar santiago',
                supplier_name: 'Proveedor Interno',
                created_at: Date.now(),
                created_by_name: 'Gerente General 1',
                items: [{ sku: 'SKU-1', name: 'Producto A', quantity_ordered: 4 }],
            },
        ];

        render(<WMSTransitoTab />);

        expect(await screen.findByText('Orden Compra')).toBeTruthy();
        expect(screen.getByText('Farmacia prat')).toBeTruthy();
        expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
    });

    it('filtra direccion entrante/saliente para PO de traspaso', async () => {
        mocks.state.purchaseOrders = [
            {
                id: '95e16cda-8f90-4d20-9bdb-ad0a3eea8f70',
                status: 'SENT',
                notes: '[TRANSFER_REQUEST] Traspaso | ORIGEN:Farmacia Vallenar santiago(bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6) | DESTINO:Farmacia prat(aaaa1111-1111-4111-8111-111111111111)',
                location_id: 'aaaa1111-1111-4111-8111-111111111111',
                location_name: 'Farmacia prat',
                created_at: Date.now(),
                items: [{ sku: 'SKU-2', name: 'Producto B', quantity_ordered: 2 }],
            },
        ];

        render(<WMSTransitoTab />);

        await waitFor(() => {
            expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Entrante' }));
        await waitFor(() => {
            expect(screen.getByText('Sin movimientos en tránsito')).toBeTruthy();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Saliente' }));
        await waitFor(() => {
            expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
        });
    });
});

