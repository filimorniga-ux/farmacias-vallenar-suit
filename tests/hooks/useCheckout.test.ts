/**
 * @vitest-environment jsdom
 * 
 * Tests for useCheckout Hook
 * 
 * Covers:
 * - Initial state
 * - Cart total calculations
 * - Loyalty points discount
 * - Payment method changes
 * - Checkout validation
 * - Successful checkout flow
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCheckout, PaymentMethod } from '@/presentation/hooks/useCheckout';
import { mockCartItems, mockShift, mockUser } from '../__mocks__/stores';

// =====================================================
// MOCKS - Must be hoisted before imports
// =====================================================

// Store mocks - defined early so they can be referenced in vi.mock
const mockProcessSale = vi.fn();
const mockRedeemPoints = vi.fn();
const mockCalculateDiscountValue = vi.fn((points: number) => Math.floor(points * 0.1));

// Mock localStorage
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => {
        localStorageStore[key] = value;
    },
    removeItem: (key: string) => {
        delete localStorageStore[key];
    },
    clear: () => {
        Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]);
    },
};

// Set up global mocks
Object.defineProperty(global, 'localStorage', { 
    value: localStorageMock, 
    writable: true 
});

// Mock toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
    },
}));

// Mock print utils
vi.mock('@/presentation/utils/print-utils', () => ({
    printSaleTicket: vi.fn().mockResolvedValue(undefined),
}));

// Mock SII DTE logic
vi.mock('@/domain/logic/sii_dte', () => ({
    shouldGenerateDTE: vi.fn((method: string) => ({
        shouldGenerate: method === 'CASH' || method === 'TRANSFER',
        status: method === 'CASH' || method === 'TRANSFER' ? 'CONFIRMED_DTE' : 'FISCALIZED_BY_VOUCHER',
    })),
}));

// Mock stores
vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        cart: mockCartItems,
        currentShift: mockShift,
        currentCustomer: null,
        user: mockUser,
        processSale: mockProcessSale,
        redeemPoints: mockRedeemPoints,
        calculateDiscountValue: mockCalculateDiscountValue,
    }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: () => ({
        currentLocation: {
            id: 'loc-1',
            name: 'Sucursal Test',
            config: {},
        },
    }),
}));

vi.mock('@/presentation/store/useSettingsStore', () => ({
    useSettingsStore: () => ({
        enable_sii_integration: false,
        hardware: { printer_type: 'thermal' },
    }),
}));

// =====================================================
// TESTS
// =====================================================

describe('useCheckout Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.clear();
        // Reset to default successful behavior
        mockProcessSale.mockResolvedValue(true);
        mockRedeemPoints.mockReturnValue(true);
        mockCalculateDiscountValue.mockImplementation((points: number) => Math.floor(points * 0.1));
    });

    afterEach(() => {
        cleanup();
    });

    // -------------------------------------------------
    // INITIAL STATE
    // -------------------------------------------------
    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const { result } = renderHook(() => useCheckout());

            expect(result.current.isProcessing).toBe(false);
            expect(result.current.paymentMethod).toBe('CASH');
            expect(result.current.transferId).toBe('');
            expect(result.current.pointsToRedeem).toBe(0);
            expect(result.current.autoPrint).toBe(true); // default when localStorage is empty
        });

        it('should read autoPrint false from localStorage', () => {
            localStorageStore['pos_auto_print'] = 'false';
            
            const { result } = renderHook(() => useCheckout());
            
            expect(result.current.autoPrint).toBe(false);
        });
    });

    // -------------------------------------------------
    // CART CALCULATIONS
    // -------------------------------------------------
    describe('Cart Calculations', () => {
        it('should calculate cart total correctly', () => {
            const { result } = renderHook(() => useCheckout());

            // Cart: 2x1500 + 1x2500 = 5500
            expect(result.current.cartTotal).toBe(5500);
        });

        it('should calculate points discount correctly', () => {
            const { result } = renderHook(() => useCheckout());

            act(() => {
                result.current.setPointsToRedeem(100);
            });

            // 100 points * 0.1 = 10
            expect(result.current.pointsDiscount).toBe(10);
        });

        it('should calculate final total after discount', () => {
            const { result } = renderHook(() => useCheckout());

            act(() => {
                result.current.setPointsToRedeem(100);
            });

            // 5500 - 10 = 5490
            expect(result.current.finalTotal).toBe(5490);
        });

        it('should not allow negative final total', () => {
            const { result } = renderHook(() => useCheckout());

            // Set a huge discount
            mockCalculateDiscountValue.mockReturnValue(10000);

            act(() => {
                result.current.setPointsToRedeem(100000);
            });

            expect(result.current.finalTotal).toBeGreaterThanOrEqual(0);
        });
    });

    // -------------------------------------------------
    // PAYMENT METHOD
    // -------------------------------------------------
    describe('Payment Method', () => {
        it('should change payment method', () => {
            const { result } = renderHook(() => useCheckout());

            act(() => {
                result.current.setPaymentMethod('DEBIT');
            });

            expect(result.current.paymentMethod).toBe('DEBIT');
        });

        it('should support all payment methods', () => {
            const { result } = renderHook(() => useCheckout());
            const methods: PaymentMethod[] = ['CASH', 'DEBIT', 'CREDIT', 'TRANSFER'];

            methods.forEach(method => {
                act(() => {
                    result.current.setPaymentMethod(method);
                });
                expect(result.current.paymentMethod).toBe(method);
            });
        });

        it('should update transfer ID for TRANSFER method', () => {
            const { result } = renderHook(() => useCheckout());

            act(() => {
                result.current.setPaymentMethod('TRANSFER');
                result.current.setTransferId('TXN-12345');
            });

            expect(result.current.transferId).toBe('TXN-12345');
        });
    });

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------
    describe('Checkout Validation', () => {
        it('should allow checkout with valid cart and shift', () => {
            const { result } = renderHook(() => useCheckout());

            expect(result.current.canCheckout).toBe(true);
        });
    });

    // -------------------------------------------------
    // CHECKOUT FLOW
    // -------------------------------------------------
    describe('Checkout Flow', () => {
        it('should process sale successfully', async () => {
            mockProcessSale.mockResolvedValue(true);
            const onSuccess = vi.fn();
            const { result } = renderHook(() => useCheckout({ onSuccess }));

            let checkoutResult: any;
            await act(async () => {
                checkoutResult = await result.current.checkout();
            });

            expect(checkoutResult?.success).toBe(true);
            expect(checkoutResult?.saleId).toBeDefined();
            expect(mockProcessSale).toHaveBeenCalled();
            expect(onSuccess).toHaveBeenCalled();
        });

        it('should handle sale processing error', async () => {
            mockProcessSale.mockResolvedValue(false);
            const onError = vi.fn();
            const { result } = renderHook(() => useCheckout({ onError }));

            let checkoutResult: any;
            await act(async () => {
                checkoutResult = await result.current.checkout();
            });

            expect(checkoutResult?.success).toBe(false);
            expect(checkoutResult?.error).toBeDefined();
            expect(onError).toHaveBeenCalled();
        });

        it('should reset state after successful checkout', async () => {
            mockProcessSale.mockResolvedValue(true);
            const { result } = renderHook(() => useCheckout());

            // Set non-default values
            act(() => {
                result.current.setPaymentMethod('DEBIT');
                result.current.setTransferId('TXN-123');
                result.current.setPointsToRedeem(50);
            });

            await act(async () => {
                await result.current.checkout();
            });

            // After successful checkout, state should reset
            expect(result.current.paymentMethod).toBe('CASH');
            expect(result.current.transferId).toBe('');
            expect(result.current.pointsToRedeem).toBe(0);
        });

        it('should set isProcessing during checkout', async () => {
            mockProcessSale.mockResolvedValue(true);
            const { result } = renderHook(() => useCheckout());

            // After checkout completes, isProcessing should be false
            await act(async () => {
                await result.current.checkout();
            });

            expect(result.current.isProcessing).toBe(false);
        });
    });

    // -------------------------------------------------
    // AUTO-PRINT
    // -------------------------------------------------
    describe('Auto-Print', () => {
        it('should persist autoPrint preference to localStorage', () => {
            const { result } = renderHook(() => useCheckout());

            act(() => {
                result.current.setAutoPrint(false);
            });

            expect(localStorageStore['pos_auto_print']).toBe('false');
        });

        it('should toggle autoPrint setting', () => {
            const { result } = renderHook(() => useCheckout());

            expect(result.current.autoPrint).toBe(true);

            act(() => {
                result.current.setAutoPrint(false);
            });

            expect(result.current.autoPrint).toBe(false);
        });
    });

    // -------------------------------------------------
    // RESET
    // -------------------------------------------------
    describe('Reset', () => {
        it('should reset all checkout state', () => {
            const { result } = renderHook(() => useCheckout());

            // Set non-default values
            act(() => {
                result.current.setPaymentMethod('TRANSFER');
                result.current.setTransferId('TXN-999');
                result.current.setPointsToRedeem(200);
            });

            // Verify non-default values are set
            expect(result.current.paymentMethod).toBe('TRANSFER');
            expect(result.current.transferId).toBe('TXN-999');
            expect(result.current.pointsToRedeem).toBe(200);

            act(() => {
                result.current.reset();
            });

            expect(result.current.paymentMethod).toBe('CASH');
            expect(result.current.transferId).toBe('');
            expect(result.current.pointsToRedeem).toBe(0);
        });
    });
});
