/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WMSTransitoTab from '@/presentation/components/wms/tabs/WMSTransitoTab';

type PharmaState = {
    currentLocationId: string;
};

const mocks = vi.hoisted(() => {
    const state: PharmaState = {
        currentLocationId: 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6',
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
        mocks.refreshTransitMock.mockResolvedValue(undefined);
    });

    it('muestra en transito una OC del kanban (ORDERED/SENT)', async () => {
        const purchaseOrders = [
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
                purchaseOrders={purchaseOrders as never[]}
                shipments={[]}
                onRefresh={mocks.refreshTransitMock}
            />
        );

        expect(await screen.findByText('Orden Compra')).toBeTruthy();
        expect(screen.getByText('Farmacia prat')).toBeTruthy();
        expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
    });

    it('filtra direccion entrante/saliente para PO de traspaso', async () => {
        const purchaseOrders = [
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
                purchaseOrders={purchaseOrders as never[]}
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
                purchaseOrders={[]}
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
                purchaseOrders={[]}
                shipments={mocks.shipmentRows as never[]}
                bootstrapOnMount={false}
                onReceiveShipment={vi.fn()}
            />
        );

        expect(await screen.findByText('Farmacia prat')).toBeTruthy();
        expect(screen.getByText('Farmacia Vallenar santiago')).toBeTruthy();
    });

    it('prioriza pendientes en tránsito por antigüedad y muestra razón visible sin mutar estado', async () => {
        const now = Date.now();
        const currentLocationId = mocks.state.currentLocationId;
        const shipments = [
            {
                id: 'shp-recent',
                type: 'INTER_BRANCH',
                status: 'IN_TRANSIT',
                origin_location_id: 'origin-recent',
                origin_location_name: 'Bodega Reciente',
                destination_location_id: currentLocationId,
                destination_location_name: 'Farmacia Vallenar santiago',
                created_at: now - (2 * 60 * 60 * 1000),
                items: [{ id: 'item-recent', sku: 'SKU-R', name: 'Producto reciente', quantity: 1 }],
            },
            {
                id: 'shp-old',
                type: 'INTER_BRANCH',
                status: 'IN_TRANSIT',
                origin_location_id: 'origin-old',
                origin_location_name: 'Bodega Antigua',
                destination_location_id: currentLocationId,
                destination_location_name: 'Farmacia Vallenar santiago',
                created_at: now - (80 * 60 * 60 * 1000),
                items: [{ id: 'item-old', sku: 'SKU-A', name: 'Producto antiguo', quantity: 1 }],
            },
        ];

        render(
            <WMSTransitoTab
                purchaseOrders={[]}
                shipments={shipments as never[]}
                bootstrapOnMount={false}
                onReceiveShipment={vi.fn()}
            />
        );

        const rows = await screen.findAllByTestId('wms-transit-row');
        expect(rows[0].textContent).toContain('Bodega Antigua');
        expect(rows[0].textContent).toContain('Prioridad alta');
        expect(rows[0].textContent).toContain('Más antiguo');
        expect(rows[0].textContent).toContain('80 h pendiente');
    });
});
