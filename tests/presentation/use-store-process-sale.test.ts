/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shift } from '@/domain/types';
import { usePharmaStore } from '@/presentation/store/useStore';
import { mockInventory, mockUser } from '../__mocks__/stores';

const { mockSaveSaleTransaction } = vi.hoisted(() => ({
    mockSaveSaleTransaction: vi.fn(),
}));

vi.mock('@/domain/services/TigerDataService', () => ({
    TigerDataService: {
        saveSaleTransaction: mockSaveSaleTransaction,
    },
}));

vi.mock('@/presentation/store/indexedDBStorage', () => ({
    indexedDBWithLocalStorageFallback: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
    },
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        warning: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
    },
}));

const activeShift: Shift = {
    id: '11111111-1111-4111-8111-111111111111',
    terminal_id: 'term-1',
    user_id: mockUser.id,
    authorized_by: 'manager-1',
    start_time: Date.now() - 60_000,
    opening_amount: 50_000,
    status: 'ACTIVE',
};

describe('useStore.processSale', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        usePharmaStore.setState({
            currentLocationId: 'loc-1',
            currentTerminalId: 'term-1',
            currentShift: activeShift,
            user: mockUser,
            inventory: [{ ...mockInventory[0], stock_actual: 10 }],
            cart: [],
            currentCustomer: null,
            salesHistory: [],
        });

        usePharmaStore.getState().addToCart({ ...mockInventory[0], stock_actual: 10 }, 2);
    });

    it('does not patch inventory locally when the sale is synced on the server', async () => {
        mockSaveSaleTransaction.mockResolvedValue({
            success: true,
            transactionId: 'sale-1',
        });

        const previousStock = usePharmaStore.getState().inventory[0]?.stock_actual;

        const success = await usePharmaStore.getState().processSale('CASH');

        expect(success).toBe(true);
        expect(usePharmaStore.getState().inventory[0]?.stock_actual).toBe(previousStock);
        expect(usePharmaStore.getState().cart).toHaveLength(0);
        expect(usePharmaStore.getState().currentCustomer).toBeNull();
        expect(usePharmaStore.getState().salesHistory).toHaveLength(1);
        expect(usePharmaStore.getState().salesHistory[0]?.is_synced).toBe(true);
    });

    it('does not patch canonical inventory when the sale falls back to unsynced local mode', async () => {
        mockSaveSaleTransaction.mockResolvedValue({
            success: false,
            transactionId: '',
            error: 'offline',
        });

        const success = await usePharmaStore.getState().processSale('CASH');

        expect(success).toBe(true);
        expect(usePharmaStore.getState().inventory[0]?.stock_actual).toBe(10);
        expect(usePharmaStore.getState().cart).toHaveLength(0);
        expect(usePharmaStore.getState().salesHistory).toHaveLength(1);
        expect(usePharmaStore.getState().salesHistory[0]?.is_synced).toBe(false);
    });
});
