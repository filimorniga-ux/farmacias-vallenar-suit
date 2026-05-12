/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyKanban from '@/presentation/components/supply/SupplyKanban';

type NullableLocation = { id: string } | null;
type PharmaState = {
    currentLocationId?: string;
    suppliers: unknown[];
    user: { id: string };
};

type LocationStoreState = {
    currentLocation: NullableLocation;
    locations: Array<{ id: string; default_warehouse_id?: string | null; name?: string }>;
};
type LocationSelector = (state: LocationStoreState) => unknown;

const mocks = vi.hoisted(() => {
    const refetchShipmentsMock = vi.fn<() => Promise<{ error: null }>>();
    const refetchPurchaseOrdersMock = vi.fn<() => Promise<{ error: null }>>();
    const invalidatePurchaseOrdersMock = vi.fn<() => Promise<void>>();
    const updatePurchaseOrderSecureMock = vi.fn();
    const getHistoryItemDetailsSecureMock = vi.fn();
    const deletePurchaseOrderSecureMock = vi.fn();
    const toastErrorMock = vi.fn();
    const toastSuccessMock = vi.fn();
    const useShipmentsQueryMock = vi.fn();
    const usePurchaseOrdersQueryMock = vi.fn();

    const pharmaState: PharmaState = {
        currentLocationId: undefined,
        suppliers: [],
        user: { id: '1719073d-9da1-40d7-9dce-28ac3a415a6b' },
    };

    let locationState: LocationStoreState = { currentLocation: null, locations: [] };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: PharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    const useLocationStoreMock = (selector: LocationSelector) => selector(locationState);

    return {
        pharmaState,
        refetchShipmentsMock,
        refetchPurchaseOrdersMock,
        invalidatePurchaseOrdersMock,
        updatePurchaseOrderSecureMock,
        getHistoryItemDetailsSecureMock,
        deletePurchaseOrderSecureMock,
        toastErrorMock,
        toastSuccessMock,
        useShipmentsQueryMock,
        usePurchaseOrdersQueryMock,
        usePharmaStoreMock,
        useLocationStoreMock,
        setLocationState: (next: LocationStoreState) => {
            locationState = next;
        },
    };
});

const {
    pharmaState,
    refetchShipmentsMock,
    refetchPurchaseOrdersMock,
    invalidatePurchaseOrdersMock,
    updatePurchaseOrderSecureMock,
    getHistoryItemDetailsSecureMock,
    deletePurchaseOrderSecureMock,
    toastErrorMock,
    toastSuccessMock,
    useShipmentsQueryMock,
    usePurchaseOrdersQueryMock,
    setLocationState,
} = mocks;

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: mocks.useLocationStoreMock,
}));

vi.mock('@/presentation/hooks/useShipmentsQuery', () => ({
    useShipmentsQuery: mocks.useShipmentsQueryMock,
}));

vi.mock('@/presentation/hooks/usePurchaseOrdersQuery', () => ({
    usePurchaseOrdersQuery: mocks.usePurchaseOrdersQueryMock,
}));

vi.mock('@/actions/supply-v2', () => ({
    deletePurchaseOrderSecure: mocks.deletePurchaseOrderSecureMock,
    getHistoryItemDetailsSecure: mocks.getHistoryItemDetailsSecureMock,
    updatePurchaseOrderSecure: mocks.updatePurchaseOrderSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        error: mocks.toastErrorMock,
        success: mocks.toastSuccessMock,
    },
}));

describe('SupplyKanban fallback de ubicación', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pharmaState.currentLocationId = undefined;
        pharmaState.suppliers = [];
        setLocationState({ currentLocation: null, locations: [] });

        refetchShipmentsMock.mockResolvedValue({ error: null });
        refetchPurchaseOrdersMock.mockResolvedValue({ error: null });
        invalidatePurchaseOrdersMock.mockResolvedValue(undefined);
        updatePurchaseOrderSecureMock.mockResolvedValue({ success: true });
        deletePurchaseOrderSecureMock.mockResolvedValue({ success: true });
        getHistoryItemDetailsSecureMock.mockResolvedValue({ success: true, data: [] });

        useShipmentsQueryMock.mockImplementation((locationId?: string, options?: { enabled?: boolean }) => ({
            data: [],
            refetch: refetchShipmentsMock,
            locationId,
            options,
        }));

        usePurchaseOrdersQueryMock.mockImplementation((locationId?: string, options?: { enabled?: boolean }) => ({
            data: [],
            refetch: refetchPurchaseOrdersMock,
            invalidatePurchaseOrders: invalidatePurchaseOrdersMock,
            locationId,
            options,
        }));
    });

    it('usa scope corporativo cuando el locationId efectivo no es UUID válido', () => {
        pharmaState.currentLocationId = 'farmacia-prat-legacy';

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        expect(useShipmentsQueryMock).toHaveBeenCalledWith(undefined, { enabled: true });
        expect(usePurchaseOrdersQueryMock).toHaveBeenCalledWith(undefined, { enabled: true });
    });

    it('prioriza el locationId visible entregado por la página sobre el store global', () => {
        pharmaState.currentLocationId = '550e8400-e29b-41d4-a716-446655440000';
        setLocationState({
            currentLocation: { id: '550e8400-e29b-41d4-a716-446655440000' },
            locations: [
                { id: '550e8400-e29b-41d4-a716-446655440000', default_warehouse_id: 'wh-1' },
                { id: '550e8400-e29b-41d4-a716-446655440999', default_warehouse_id: 'wh-2' },
            ],
        });

        render(
            <SupplyKanban
                locationId="550e8400-e29b-41d4-a716-446655440999"
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        expect(useShipmentsQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440999', { enabled: true });
        expect(usePurchaseOrdersQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440999', { enabled: true });
    });

    it('usa solo el scope de la sucursal y delega el fallback al query layer', () => {
        pharmaState.currentLocationId = '550e8400-e29b-41d4-a716-446655440000';

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        expect(useShipmentsQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', { enabled: true });
        expect(usePurchaseOrdersQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', { enabled: true });
    });

    it('permite desactivar el bootstrap explícito cuando el dominio ya fue inicializado', async () => {
        pharmaState.currentLocationId = '550e8400-e29b-41d4-a716-446655440000';

        render(
            <SupplyKanban
                bootstrapOnMount={false}
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Kanban unificado: Órdenes de Compra + Movimientos WMS')).toBeTruthy();
        });

        expect(useShipmentsQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', { enabled: true });
        expect(usePurchaseOrdersQueryMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', { enabled: true });
        expect(refetchShipmentsMock).not.toHaveBeenCalled();
        expect(refetchPurchaseOrdersMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

        await waitFor(() => {
            expect(refetchShipmentsMock).toHaveBeenCalledTimes(1);
            expect(refetchPurchaseOrdersMock).toHaveBeenCalledTimes(1);
        });
    });

    it('marca enviada usando warehouse_id legacy y line_items cuando falta target_warehouse_id/items', async () => {
        usePurchaseOrdersQueryMock.mockReturnValue({
            data: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440100',
                    status: 'APPROVED',
                    supplier_name: 'Proveedor Legacy',
                    warehouse_id: '550e8400-e29b-41d4-a716-446655440200',
                    items_count: 1,
                    line_items: [
                        {
                            sku: 'SKU-001',
                            name: 'Producto Test',
                            quantity_ordered: 2,
                            cost_price: 1000,
                            product_id: '550e8400-e29b-41d4-a716-446655440300',
                        },
                    ],
                },
            ],
            refetch: refetchPurchaseOrdersMock,
            invalidatePurchaseOrders: invalidatePurchaseOrdersMock,
        });

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'MARCAR EN TRÁNSITO' }));
        expect(updatePurchaseOrderSecureMock).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar envío' }));

        await waitFor(() => {
            expect(updatePurchaseOrderSecureMock).toHaveBeenCalledTimes(1);
            expect(invalidatePurchaseOrdersMock).toHaveBeenCalledTimes(1);
        });

        const payload = updatePurchaseOrderSecureMock.mock.calls[0]?.[1] as { targetWarehouseId?: string };
        expect(payload?.targetWarehouseId).toBe('550e8400-e29b-41d4-a716-446655440200');
        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene bodega de destino');
        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene items para enviar');
        expect(toastSuccessMock).toHaveBeenCalledWith('Orden marcada como enviada');
    });

    it('recupera items desde backend cuando la tarjeta no trae detalle', async () => {
        usePurchaseOrdersQueryMock.mockReturnValue({
            data: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440101',
                    status: 'APPROVED',
                    supplier_name: 'Proveedor Sin Detalle',
                    target_warehouse_id: '550e8400-e29b-41d4-a716-446655440201',
                    items_count: 2,
                },
            ],
            refetch: refetchPurchaseOrdersMock,
            invalidatePurchaseOrders: invalidatePurchaseOrdersMock,
        });
        getHistoryItemDetailsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    sku: 'SKU-API-1',
                    name: 'Producto API',
                    quantity: 3,
                    cost: 1200,
                    product_id: '550e8400-e29b-41d4-a716-446655440301',
                },
            ],
        });

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'MARCAR EN TRÁNSITO' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirmar envío' }));

        await waitFor(() => {
            expect(getHistoryItemDetailsSecureMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440101', 'PO');
            expect(updatePurchaseOrderSecureMock).toHaveBeenCalledTimes(1);
            expect(invalidatePurchaseOrdersMock).toHaveBeenCalledTimes(1);
        });

        expect(toastErrorMock).not.toHaveBeenCalledWith('La orden no tiene items para enviar');
        expect(toastSuccessMock).toHaveBeenCalledWith('Orden marcada como enviada');
    });

    it('permite aprobar una solicitud en borradores antes de enviarla a tránsito', async () => {
        usePurchaseOrdersQueryMock.mockReturnValue({
            data: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440102',
                    status: 'DRAFT',
                    supplier_name: 'Proveedor Solicitud',
                    target_warehouse_id: '550e8400-e29b-41d4-a716-446655440202',
                    items_count: 1,
                    line_items: [
                        {
                            sku: 'SKU-002',
                            name: 'Producto Borrador',
                            quantity_ordered: 4,
                            cost_price: 0,
                            product_id: '550e8400-e29b-41d4-a716-446655440302',
                        },
                    ],
                },
            ],
            refetch: refetchPurchaseOrdersMock,
            invalidatePurchaseOrders: invalidatePurchaseOrdersMock,
        });

        render(
            <SupplyKanban
                onEditOrder={vi.fn()}
                onReceiveOrder={vi.fn()}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'APROBAR SOLICITUD' }));

        await waitFor(() => {
            expect(updatePurchaseOrderSecureMock).toHaveBeenCalledTimes(1);
            expect(invalidatePurchaseOrdersMock).toHaveBeenCalledTimes(1);
        });

        const payload = updatePurchaseOrderSecureMock.mock.calls[0]?.[1] as { status?: string };
        expect(payload?.status).toBe('APPROVED');
        expect(toastSuccessMock).toHaveBeenCalledWith('Solicitud aprobada');
    });
});
