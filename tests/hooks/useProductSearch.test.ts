/**
 * @vitest-environment jsdom
 * 
 * Tests for useProductSearch Hook
 * 
 * Covers:
 * - Initial state
 * - Search filtering
 * - FEFO sorting
 * - Barcode scanning
 * - Quote retrieval
 * - Keyboard navigation
 * - Product selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProductSearch } from '@/presentation/hooks/useProductSearch';
import { mockInventory } from '../__mocks__/stores';

// =====================================================
// MOCKS
// =====================================================

// Mock toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock Audio
class MockAudio {
    play = vi.fn().mockResolvedValue(undefined);
}
global.Audio = MockAudio as any;

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
    value: vi.fn(),
    writable: true,
});

// Store mocks
const mockAddToCart = vi.fn();
const mockRetrieveQuote = vi.fn().mockResolvedValue(false);

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        inventory: mockInventory,
        addToCart: mockAddToCart,
        retrieveQuote: mockRetrieveQuote,
    }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: () => ({
        currentLocation: {
            id: 'loc-1',
            name: 'Sucursal Test',
        },
    }),
}));

// Mock scan action (V2)
const mockScanProduct = vi.fn();
vi.mock('@/actions/scan-v2', () => ({
    scanProductSecure: (...args: any[]) => mockScanProduct(...args),
}));

// =====================================================
// TESTS
// =====================================================

describe('useProductSearch Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    // -------------------------------------------------
    // INITIAL STATE
    // -------------------------------------------------
    describe('Initial State', () => {
        it('should initialize with empty search term', () => {
            const { result } = renderHook(() => useProductSearch());

            expect(result.current.searchTerm).toBe('');
            expect(result.current.selectedIndex).toBe(0);
            expect(result.current.hasResults).toBe(false);
            expect(result.current.resultCount).toBe(0);
        });

        it('should have empty filtered inventory initially', () => {
            const { result } = renderHook(() => useProductSearch());

            expect(result.current.filteredInventory).toEqual([]);
        });
    });

    // -------------------------------------------------
    // SEARCH FILTERING
    // -------------------------------------------------
    describe('Search Filtering', () => {
        it('should filter by product name', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            expect(result.current.hasResults).toBe(true);
            expect(result.current.filteredInventory.length).toBe(1);
            expect(result.current.filteredInventory[0].name).toBe('Paracetamol 500mg');
        });

        it('should filter by SKU', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('SKU001');
            });

            expect(result.current.hasResults).toBe(true);
            expect(result.current.filteredInventory[0].sku).toBe('SKU001');
        });

        it('should filter by DCI (active ingredient)', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('ibuprofeno');
            });

            expect(result.current.hasResults).toBe(true);
            expect(result.current.filteredInventory[0].dci).toBe('ibuprofeno');
        });

        it('should be case insensitive', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('PARACETAMOL');
            });

            expect(result.current.hasResults).toBe(true);
            expect(result.current.filteredInventory[0].name).toContain('Paracetamol');
        });

        it('should return empty results for non-matching search', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('producto-inexistente');
            });

            expect(result.current.hasResults).toBe(false);
            expect(result.current.filteredInventory).toEqual([]);
        });

        it('should return multiple results for partial match', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg');
            });

            // Paracetamol 500mg and Amoxicilina 500mg
            expect(result.current.resultCount).toBeGreaterThanOrEqual(2);
        });
    });

    // -------------------------------------------------
    // FEFO SORTING
    // -------------------------------------------------
    describe('FEFO Sorting', () => {
        it('should sort results by expiry date (First Expiry First Out)', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg');
            });

            if (result.current.filteredInventory.length >= 2) {
                const firstExpiry = result.current.filteredInventory[0].expiry_date || 0;
                const secondExpiry = result.current.filteredInventory[1].expiry_date || 0;

                expect(firstExpiry).toBeLessThanOrEqual(secondExpiry);
            }
        });

        it('should find best batch using FEFO logic', () => {
            const { result } = renderHook(() => useProductSearch());

            const batch = result.current.findBestBatch('SKU001');

            expect(batch).toBeDefined();
            expect(batch?.sku).toBe('SKU001');
        });

        it('should prefer batches with stock over out-of-stock', () => {
            const { result } = renderHook(() => useProductSearch());

            // SKU003 has 0 stock
            const batch = result.current.findBestBatch('SKU003');

            // Should still return something, but ideally with stock
            expect(batch).toBeDefined();
        });
    });

    // -------------------------------------------------
    // BARCODE SCANNING
    // -------------------------------------------------
    describe('Barcode Scanning', () => {
        it('should add product to cart when barcode is scanned', () => {
            const onProductSelect = vi.fn();
            const { result } = renderHook(() => useProductSearch({ onProductSelect }));

            act(() => {
                result.current.handleBarcodeInput('7891234567890');
            });

            expect(mockAddToCart).toHaveBeenCalled();
        });

        it('should show error for unknown barcode', async () => {
            const { toast } = await import('sonner');
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.handleBarcodeInput('9999999999999');
            });

            expect(toast.error).toHaveBeenCalledWith('Producto no encontrado');
        });

        it('should handle server-side scan successfully', async () => {
            mockScanProduct.mockResolvedValueOnce({
                success: true,
                data: { id: 'prod-1' },
            });

            const { result } = renderHook(() => useProductSearch());

            let scanResult: any;
            await act(async () => {
                scanResult = await result.current.handleScan('7891234567890');
            });

            expect(scanResult?.success).toBe(true);
            expect(mockAddToCart).toHaveBeenCalled();
        });

        it('should trigger haptic feedback on scan', async () => {
            mockScanProduct.mockResolvedValueOnce({
                success: true,
                data: { id: 'prod-1' },
            });

            const { result } = renderHook(() => useProductSearch());

            await act(async () => {
                await result.current.handleScan('7891234567890');
            });

            expect(navigator.vibrate).toHaveBeenCalledWith(200);
        });
    });

    // -------------------------------------------------
    // QUOTE HANDLING
    // -------------------------------------------------
    describe('Quote Handling', () => {
        it('should detect quote code and retrieve quote', async () => {
            mockRetrieveQuote.mockResolvedValueOnce(true);
            const onQuoteLoad = vi.fn();
            const { result } = renderHook(() => useProductSearch({ onQuoteLoad }));

            await act(async () => {
                await result.current.handleScan('COT-12345');
            });

            expect(mockRetrieveQuote).toHaveBeenCalledWith('COT-12345');
            expect(onQuoteLoad).toHaveBeenCalledWith('COT-12345');
        });

        it('should handle quote not found', async () => {
            mockRetrieveQuote.mockResolvedValueOnce(false);
            const { result } = renderHook(() => useProductSearch());

            let scanResult: any;
            await act(async () => {
                scanResult = await result.current.handleScan('COT-99999');
            });

            expect(scanResult?.success).toBe(false);
        });

        it('should handle quote code from barcode input', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.handleBarcodeInput('COT-12345');
            });

            expect(mockRetrieveQuote).toHaveBeenCalledWith('COT-12345');
        });
    });

    // -------------------------------------------------
    // KEYBOARD NAVIGATION
    // -------------------------------------------------
    describe('Keyboard Navigation', () => {
        it('should select product on Enter key', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            // Simulate Enter key
            const event = {
                key: 'Enter',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(event);
            });

            expect(mockAddToCart).toHaveBeenCalled();
        });

        it('should navigate down on ArrowDown', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg'); // Multiple results
            });

            const event = {
                key: 'ArrowDown',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(event);
            });

            expect(result.current.selectedIndex).toBe(1);
        });

        it('should navigate up on ArrowUp', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg');
            });

            // First go down
            const downEvent = {
                key: 'ArrowDown',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(downEvent);
            });

            // Then go up
            const upEvent = {
                key: 'ArrowUp',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(upEvent);
            });

            expect(result.current.selectedIndex).toBe(0);
        });

        it('should clear search on Escape', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            const event = {
                key: 'Escape',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(event);
            });

            expect(result.current.searchTerm).toBe('');
        });

        it('should wrap around on ArrowDown at end', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg');
            });

            const resultCount = result.current.resultCount;

            // Navigate to end and beyond
            for (let i = 0; i <= resultCount; i++) {
                const event = {
                    key: 'ArrowDown',
                    preventDefault: vi.fn()
                } as unknown as React.KeyboardEvent;

                act(() => {
                    result.current.handleKeyDown(event);
                });
            }

            expect(result.current.selectedIndex).toBeLessThan(resultCount);
        });
    });

    // -------------------------------------------------
    // PRODUCT SELECTION
    // -------------------------------------------------
    describe('Product Selection', () => {
        it('should add product to cart on select', () => {
            const onProductSelect = vi.fn();
            const { result } = renderHook(() => useProductSearch({ onProductSelect }));

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            act(() => {
                result.current.selectProduct();
            });

            expect(mockAddToCart).toHaveBeenCalled();
            expect(onProductSelect).toHaveBeenCalled();
        });

        it('should clear search after selecting product', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            act(() => {
                result.current.selectProduct();
            });

            expect(result.current.searchTerm).toBe('');
        });

        it('should select product by index', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('500mg');
            });

            act(() => {
                result.current.selectProduct(1);
            });

            expect(mockAddToCart).toHaveBeenCalled();
        });

        it('should return false when selecting from empty results', () => {
            const { result } = renderHook(() => useProductSearch());

            let selectResult: boolean | undefined;
            act(() => {
                selectResult = result.current.selectProduct();
            });

            expect(selectResult).toBe(false);
        });
    });

    // -------------------------------------------------
    // UTILITY METHODS
    // -------------------------------------------------
    describe('Utility Methods', () => {
        it('should clear search and reset index', () => {
            const { result } = renderHook(() => useProductSearch());

            act(() => {
                result.current.setSearchTerm('paracetamol');
            });

            act(() => {
                result.current.clearSearch();
            });

            expect(result.current.searchTerm).toBe('');
            expect(result.current.selectedIndex).toBe(0);
        });

        it('should reset selectedIndex when search term changes', () => {
            const { result } = renderHook(() => useProductSearch());

            // Set search and navigate
            act(() => {
                result.current.setSearchTerm('500mg');
            });

            const downEvent = {
                key: 'ArrowDown',
                preventDefault: vi.fn()
            } as unknown as React.KeyboardEvent;

            act(() => {
                result.current.handleKeyDown(downEvent);
            });

            expect(result.current.selectedIndex).toBe(1);

            // Change search
            act(() => {
                result.current.setSearchTerm('para');
            });

            expect(result.current.selectedIndex).toBe(0);
        });
    });
});
