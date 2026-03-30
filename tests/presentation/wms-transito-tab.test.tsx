/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WMSTransitoTab from '@/presentation/components/wms/tabs/WMSTransitoTab';

type PharmaState = {
    currentLocationId: string;
    purchaseOrders: unknown[];
};

const mocks = vi.hoisted(() => {
    const state: PharmaState = {
        currentLocationId: 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6',
        purchaseOrders: [],
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: PharmaState) => T) {
            return selector ? selector(state) : (state as T);
        },
        { getState: () => state }
    );

    return {
        refreshTransitMock: vi.fn(async () => {}),
        shipmentRows: [
            {
                id: 'shp-1',
                type: 'INTER_BRANCH',
                status: 'IN_TRANSIT',
                origin_location_id: 'aaaa1111-1111-4111-8111-111111111111',
                origin_location_name: 'Farmacia prat',
                destination_location_id: 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6',
                destination_location_name: 'Farmacia Vallenar santiago',
                created_at: Date.now(),
                items: [{ id: 'item-1', sku: 'SKU-9', name: 'Producto Z', quantity: 3 }],
            },
        ],
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
        mocks.state.purchaseOrders = [];
        mocks.refreshTransitMock.mockResolvedValue(undefined);
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

        render(
            <WMSTransitoTab
                shipments={[]}
                onRefresh={mocks.refreshTransitMock}
            />
        );

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

        render(
            <WMSTransitoTab
                shipments={[]}
                onRefresh={mocks.refreshTransitMock}
            />
        );

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

    it('permite desactivar el bootstrap automático cuando WMS ya inicializó el dominio', async () => {
        render(
            <WMSTransitoTab
                shipments={[]}
                bootstrapOnMount={false}
                onRefresh={mocks.refreshTransitMock}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Sin movimientos en tránsito')).toBeTruthy();
        });

        expect(mocks.refreshTransitMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

        await waitFor(() => {
            expect(mocks.refreshTransitMock).toHaveBeenCalledTimes(1);
        });
    });

    it('muestra envíos desde props en vez de depender del store global', async () => {
        render(
            <WMSTransitoTab
                shipments={mocks.shipmentRows as never[]}
                bootstrapOnMount={false}
                onReceiveShipment={vi.fn()}
            />
        );

        expect(await screen.findByText('Farmacia prat')).toBeTruthy();
        expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
    });
});
