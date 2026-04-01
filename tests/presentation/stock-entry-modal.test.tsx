/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockEntryModal from '@/presentation/components/inventory/StockEntryModal';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        inventory: [],
        updateStock: vi.fn(),
        addNewProduct: vi.fn(),
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
        suppliers: [],
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    const locationState = {
        locations: [{ id: 'loc-1', name: 'Sucursal Test', default_warehouse_id: 'wh-1', is_active: true }],
        fetchLocations: vi.fn(),
    };

    return {
        usePharmaStoreMock,
        locationState,
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector: (state: typeof mocks.locationState) => unknown) => selector(mocks.locationState),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true }),
}));

vi.mock('@/presentation/components/ui/CameraScanner', () => ({
    __esModule: true,
    default: () => <div data-testid="camera-scanner">camera</div>,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

describe('StockEntryModal', () => {
    const renderModal = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <StockEntryModal isOpen={true} onClose={vi.fn()} />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('carga la cámara solo cuando el usuario abre el flujo explícito', async () => {
        renderModal();

        expect(screen.queryByTestId('camera-scanner')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /escanear con cámara/i }));

        expect(await screen.findByTestId('camera-scanner')).not.toBeNull();
    });
});

