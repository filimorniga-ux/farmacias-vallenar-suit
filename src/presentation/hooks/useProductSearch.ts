/**
 * useProductSearch Hook
 * 
 * Encapsulates product search and inventory filtering logic
 * Extracted from POSMainScreen.tsx for modularity
 * 
 * Features:
 * - FEFO sorting (First Expiry First Out)
 * - Fast text search across name, SKU, DCI
 * - Barcode/quote handling
 * - Keyboard navigation integration
 * 
 * @version 1.0.0
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { scanProduct } from '../../actions/scan';
import { InventoryBatch } from '../../domain/types';

export interface UseProductSearchOptions {
    onProductSelect?: (product: InventoryBatch) => void;
    onQuoteLoad?: (quoteId: string) => void;
}

export function useProductSearch(options: UseProductSearchOptions = {}) {
    const { inventory, addToCart, retrieveQuote } = usePharmaStore();
    const { currentLocation } = useLocationStore();

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchTerm]);

    // FEFO sorted inventory (memoized)
    const sortedInventory = useMemo(() => {
        return [...inventory].sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0));
    }, [inventory]);

    // Filtered results (memoized)
    const filteredInventory = useMemo(() => {
        if (!searchTerm) return [];
        const lowerTerm = searchTerm.toLowerCase();

        return sortedInventory.filter(item =>
            (item.name || '').toLowerCase().includes(lowerTerm) ||
            (item.sku || '').toLowerCase().includes(lowerTerm) ||
            (item.dci || '').toLowerCase().includes(lowerTerm)
        );
    }, [sortedInventory, searchTerm]);

    // Find best batch for a code (FEFO)
    const findBestBatch = useCallback((code: string): InventoryBatch | undefined => {
        const matches = inventory.filter(p => 
            p.sku === code || p.id === code || p.barcode === code
        );
        
        if (matches.length === 0) return undefined;

        // Filter available stock, fall back to all if none available
        const availableMatches = matches.filter(m => m.stock_actual > 0);
        const candidatePool = availableMatches.length > 0 ? availableMatches : matches;

        // Sort by expiry (FEFO)
        return candidatePool.sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0))[0];
    }, [inventory]);

    // Handle barcode/QR scan
    const handleScan = useCallback(async (decodedText: string) => {
        // Check for Quote
        if (decodedText.startsWith('COT-')) {
            const success = await retrieveQuote(decodedText);
            if (success) {
                toast.success('Cotización cargada');
                options.onQuoteLoad?.(decodedText);
                return { success: true, type: 'quote' as const };
            }
            return { success: false, error: 'Cotización no encontrada' };
        }

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(200);

        // Server-side scan for indexed lookup
        const result = await scanProduct(decodedText, currentLocation?.id || '');

        if (result.success && result.data) {
            // Find full object in local memory
            const product = inventory.find(i => i.id === result.data?.id);

            if (product) {
                addToCart(product, 1);
                toast.success(`Producto agregado: ${product.name}`);
                playBeep();
                options.onProductSelect?.(product);
                return { success: true, type: 'product' as const, product };
            } else {
                toast.error('Producto en DB pero no sincronizado localmente. Sincronice.');
                return { success: false, error: 'Producto no sincronizado' };
            }
        } else {
            toast.error('Producto no encontrado');
            return { success: false, error: 'Producto no encontrado' };
        }
    }, [inventory, currentLocation, addToCart, retrieveQuote, options]);

    // Handle barcode scanner input (USB/Bluetooth)
    const handleBarcodeInput = useCallback((code: string) => {
        // Check for Quote
        if (code.startsWith('COT-')) {
            retrieveQuote(code);
            return;
        }

        const product = findBestBatch(code);
        if (product) {
            addToCart(product, 1);
            toast.success('Producto agregado', { duration: 1000 });
            playBeep();
            options.onProductSelect?.(product);
        } else {
            toast.error('Producto no encontrado');
        }
    }, [findBestBatch, addToCart, retrieveQuote, options]);

    // Select product from list
    const selectProduct = useCallback((index?: number) => {
        const targetIndex = index ?? selectedIndex;
        const product = filteredInventory[targetIndex];
        
        if (product) {
            addToCart(product, 1);
            setSearchTerm('');
            toast.success(product.name, { position: 'bottom-left' });
            playBeep();
            options.onProductSelect?.(product);
            return true;
        }
        return false;
    }, [filteredInventory, selectedIndex, addToCart, options]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            // Quote command
            if (searchTerm.startsWith('COT-')) {
                retrieveQuote(searchTerm);
                setSearchTerm('');
                return;
            }

            // Select from list
            if (filteredInventory.length > 0) {
                selectProduct();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => 
                (prev + 1) % Math.max(1, filteredInventory.length)
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => 
                (prev - 1 + filteredInventory.length) % Math.max(1, filteredInventory.length)
            );
        } else if (e.key === 'Escape') {
            setSearchTerm('');
        }
    }, [searchTerm, filteredInventory, selectProduct, retrieveQuote]);

    // Focus search input
    const focusSearch = useCallback(() => {
        searchInputRef.current?.focus();
    }, []);

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setSelectedIndex(0);
    }, []);

    return {
        // State
        searchTerm,
        selectedIndex,
        searchInputRef,

        // Computed
        filteredInventory,
        hasResults: filteredInventory.length > 0,
        resultCount: filteredInventory.length,

        // Actions
        setSearchTerm,
        handleKeyDown,
        handleScan,
        handleBarcodeInput,
        selectProduct,
        focusSearch,
        clearSearch,
        findBestBatch
    };
}

// Helper function for audio feedback
function playBeep() {
    try {
        const audio = new Audio('/beep.mp3');
        audio.play().catch(() => {});
    } catch {
        // Ignore audio errors
    }
}

export default useProductSearch;
