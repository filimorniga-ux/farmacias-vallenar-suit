/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WMSRecepcionTab from '@/presentation/components/wms/tabs/WMSRecepcionTab';

type Shipment = {
    id: string;
    type: string;
    status: string;
    origin_location_name: string;
    destination_location_name: string;
    created_at: number;
    items: Array<{ id: string; sku: string; name: string; quantity: number }>;
};

const mocks = vi.hoisted(() => {
    const shipment: Shipment = {
        id: 'shipment-1',
        type: 'TRANSFER',
        status: 'IN_TRANSIT',
        origin_location_name: 'Bodega Central',
        destination_location_name: 'Sucursal Santiago',
        created_at: Date.now(),
        items: [
            { id: 'item-1', sku: 'SKU-001', name: 'Producto de prueba', quantity: 10 },
        ],
    };

    return {
        shipment,
        getShipmentsSecureMock: vi.fn(),
        processReceptionSecureMock: vi.fn(),
        validateSupervisorPinMock: vi.fn(),
        exportStockMovementsSecureMock: vi.fn(),
        toastSuccessMock: vi.fn(),
        toastErrorMock: vi.fn(),
        toastWarningMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        currentLocationId: '9e641e03-268a-47bc-9f21-386d59547bc7',
    }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: () => ({
        currentLocation: { id: '9e641e03-268a-47bc-9f21-386d59547bc7' },
    }),
}));

vi.mock('@/actions/wms-v2', () => ({
    getShipmentsSecure: mocks.getShipmentsSecureMock,
    processReceptionSecure: mocks.processReceptionSecureMock,
}));

vi.mock('@/actions/auth-v2', () => ({
    validateSupervisorPin: mocks.validateSupervisorPinMock,
}));

vi.mock('@/actions/inventory-export-v2', () => ({
    exportStockMovementsSecure: mocks.exportStockMovementsSecureMock,
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
        warning: mocks.toastWarningMock,
    },
}));

describe('WMSRecepcionTab', () => {
    const renderWithProviders = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        return render(
            <QueryClientProvider client={queryClient}>
                <WMSRecepcionTab />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getShipmentsSecureMock.mockResolvedValue({
            success: true,
            data: { shipments: [mocks.shipment] },
        });
        mocks.processReceptionSecureMock.mockResolvedValue({ success: true });
        mocks.validateSupervisorPinMock.mockResolvedValue({
            success: true,
            authorizedBy: { id: 'mgr-1', name: 'Gerente Test', role: 'MANAGER' },
        });
    });

    it('bloquea confirmación si hay diferencia de cantidad sin PIN autorizado', async () => {
        renderWithProviders();

        const shipmentCard = await screen.findByText('Desde: Bodega Central');
        fireEvent.click(shipmentCard.closest('button') as HTMLButtonElement);

        const qtyInput = await screen.findByRole('spinbutton');
        fireEvent.change(qtyInput, { target: { value: '12' } });

        fireEvent.click(screen.getByRole('button', { name: 'Confirmar Recepción' }));

        await waitFor(() => {
            expect(mocks.toastErrorMock).toHaveBeenCalledWith('Hay diferencias de cantidad sin autorización');
        });
        expect(mocks.processReceptionSecureMock).not.toHaveBeenCalled();
        expect(await screen.findByText('Autorización Requerida')).toBeTruthy();
    });

    it('permite confirmar recepción cuando la diferencia fue autorizada por PIN', async () => {
        renderWithProviders();

        const shipmentCard = await screen.findByText('Desde: Bodega Central');
        fireEvent.click(shipmentCard.closest('button') as HTMLButtonElement);

        const qtyInput = await screen.findByRole('spinbutton');
        fireEvent.change(qtyInput, { target: { value: '12' } });
        fireEvent.blur(qtyInput, { target: { value: '12' } });

        expect(await screen.findByText('Autorización Requerida')).toBeTruthy();

        const pinInput = screen.getByPlaceholderText('••••');
        fireEvent.change(pinInput, { target: { value: '1213' } });
        fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }));

        await waitFor(() => {
            expect(mocks.validateSupervisorPinMock).toHaveBeenCalledWith('1213');
        });
        await waitFor(() => {
            expect(screen.queryByText('Autorización Requerida')).toBeNull();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirmar Recepción' }));

        await waitFor(() => {
            expect(mocks.processReceptionSecureMock).toHaveBeenCalledTimes(1);
        });

        const payload = mocks.processReceptionSecureMock.mock.calls[0][0];
        const receivedItem = payload.receivedItems.find((item: { itemId: string }) => item.itemId === 'item-1');
        expect(receivedItem.quantity).toBe(12);
    });
});
