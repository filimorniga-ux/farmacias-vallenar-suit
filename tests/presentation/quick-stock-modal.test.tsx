/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuickStockModal from '@/presentation/components/inventory/QuickStockModal';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
        updateStock: vi.fn(),
    };

    return {
        pharmaState,
        quickStockAdjustSecure: vi.fn(),
        addToOutbox: vi.fn(),
        toastWarning: vi.fn(),
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector?: (state: typeof mocks.pharmaState) => T) =>
        selector ? selector(mocks.pharmaState) : mocks.pharmaState,
}));

vi.mock('@/actions/inventory-v2', () => ({
    quickStockAdjustSecure: (...args: unknown[]) => mocks.quickStockAdjustSecure(...args),
}));

vi.mock('@/lib/store/outboxStore', () => ({
    useOutboxStore: {
        getState: () => ({
            addToOutbox: (...args: unknown[]) => mocks.addToOutbox(...args),
        }),
    },
}));

vi.mock('sonner', () => ({
    toast: {
        warning: (...args: unknown[]) => mocks.toastWarning(...args),
        error: (...args: unknown[]) => mocks.toastError(...args),
        success: (...args: unknown[]) => mocks.toastSuccess(...args),
    },
}));

describe('QuickStockModal', () => {
    const product = {
        id: 'batch-1',
        name: 'Paracetamol',
        stock_actual: 10,
    };

    const renderModal = () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        return render(
            <QueryClientProvider client={queryClient}>
                <QuickStockModal isOpen={true} onClose={vi.fn()} product={product} />
            </QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window.navigator, 'onLine', {
            configurable: true,
            value: false,
        });
    });

    it('en modo offline encola el ajuste sin mutar stock canónico en el store', async () => {
        renderModal();

        const spinbutton = screen.getByRole('spinbutton');
        const pinInput = screen.getByPlaceholderText(/\*{4}/i);

        fireEvent.change(spinbutton, { target: { value: '5' } });
        fireEvent.change(pinInput, { target: { value: '1234' } });
        fireEvent.click(screen.getByRole('button', { name: /confirmar entrada/i }));

        await waitFor(() => {
            expect(mocks.addToOutbox).toHaveBeenCalledWith('STOCK_ADJUST', {
                batchId: 'batch-1',
                adjustment: 5,
                reason: 'Entrada rápida',
                userId: 'user-1',
                authorizationPin: '1234',
            });
        });

        expect(mocks.pharmaState.updateStock).not.toHaveBeenCalled();
    });
});
