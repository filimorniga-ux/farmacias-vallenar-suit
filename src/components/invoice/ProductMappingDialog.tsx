'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Package, Check, Loader, AlertCircle, ExternalLink } from 'lucide-react';
import { searchProductsForMappingSecure, type ProductMatch, type ParsedInvoiceItem } from '@/actions/invoice-parser-v2';
import QuickProductCreate from './QuickProductCreate';

// ============================================================================
// TIPOS
// ============================================================================

interface ProductMappingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    item: ParsedInvoiceItem | null;
    onProductSelected: (productId: string, productName: string) => void;
    onSkip: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// ============================================================================
// COMPONENTE
// ============================================================================

export default function ProductMappingDialog({
    isOpen,
    onClose,
    item,
    onProductSelected,
    onSkip,
}: ProductMappingDialogProps) {
    const [mode, setMode] = useState<'search' | 'create'>('search');

    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<ProductMatch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<ProductMatch | null>(null);

    // Reset state when dialog opens with new item
    useEffect(() => {
        if (isOpen && item) {
            // Pre-fill search with item description
            const initialSearch = item.supplier_sku || item.description.split(' ').slice(0, 2).join(' ');
            setSearchTerm(initialSearch);
            setResults([]);
            setSelectedProduct(null);
            setError(null);
            setMode('search');
        }
    }, [isOpen, item]);

    // Search function
    const performSearch = useCallback(async (term: string) => {
        if (term.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await searchProductsForMappingSecure(term, 10);

            if (result.success && result.data) {
                setResults(result.data);
            } else {
                setError(result.error || 'Error buscando productos');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Debounced search
    const debouncedSearch = useCallback(debounce(performSearch, 300), [performSearch]);

    // Handle search input change
    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        debouncedSearch(value);
    };

    // Handle product selection
    const handleSelect = (product: ProductMatch) => {
        setSelectedProduct(product);
    };

    // Handle confirm
    const handleConfirm = () => {
        if (selectedProduct) {
            onProductSelected(selectedProduct.productId, selectedProduct.productName);
            onClose();
        }
    };

    // Handle skip
    const handleSkip = () => {
        onSkip();
        onClose();
    };

    // Handle new product created
    const handleCreated = (product: { id: string; name: string; sku: string }) => {
        onProductSelected(product.id, product.name);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {mode === 'create' ? 'Crear Nuevo Producto' : 'Vincular Producto'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {mode === 'search' ? (
                    <>
                        {/* Item Info */}
                        {item && (
                            <div className="p-4 bg-gray-50 border-b border-gray-200">
                                <p className="text-sm text-gray-500 mb-1">Producto de la factura:</p>
                                <p className="font-medium text-gray-900">{item.description}</p>
                                {item.supplier_sku && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        SKU Proveedor: <code className="bg-gray-200 px-1 rounded">{item.supplier_sku}</code>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Search */}
                        <div className="p-4 border-b border-gray-200">
                            <div className="relative">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Buscar producto por nombre o SKU..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    autoFocus
                                />
                                {isLoading && (
                                    <Loader size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                                )}
                            </div>
                        </div>

                        {/* Results */}
                        <div className="flex-1 overflow-y-auto p-4 min-h-[200px] max-h-[300px]">
                            {error ? (
                                <div className="flex items-center gap-2 text-red-600 justify-center py-8">
                                    <AlertCircle size={18} />
                                    {error}
                                </div>
                            ) : results.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    {searchTerm.length < 2 ? (
                                        <p>Escriba al menos 2 caracteres para buscar</p>
                                    ) : isLoading ? (
                                        <p>Buscando...</p>
                                    ) : (
                                        <>
                                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                                            <p>No se encontraron productos</p>
                                            <button
                                                onClick={() => setMode('create')}
                                                className="mt-2 text-purple-600 hover:text-purple-700 inline-flex items-center gap-1 text-sm font-medium"
                                            >
                                                Crear nuevo producto
                                                <ExternalLink size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {results.map((product) => (
                                        <button
                                            key={product.productId}
                                            onClick={() => handleSelect(product)}
                                            className={`w-full p-3 rounded-lg border text-left transition-all ${selectedProduct?.productId === product.productId
                                                    ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500'
                                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">
                                                        {product.productName}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                                        <span>SKU: {product.sku}</span>
                                                        {product.currentStock !== undefined && (
                                                            <span className={product.currentStock > 0 ? 'text-green-600' : 'text-red-600'}>
                                                                Stock: {product.currentStock}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {selectedProduct?.productId === product.productId && (
                                                    <Check size={20} className="text-purple-600 flex-shrink-0 ml-2" />
                                                )}
                                            </div>
                                        </button>
                                    ))}

                                    <div className="pt-2 border-t border-gray-100 mt-2">
                                        <button
                                            onClick={() => setMode('create')}
                                            className="w-full py-2 text-center text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                        >
                                            + Crear nuevo producto si no está en la lista
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Omitir este item
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!selectedProduct}
                                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Check size={18} />
                                Confirmar Vinculación
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="p-4">
                        <QuickProductCreate
                            defaultName={item?.description || ''}
                            // Fallback to unit_cost or total_cost/qty if unit_cost is 0 or missing
                            defaultCost={item?.unit_cost || (item && item.quantity > 0 ? item.total_cost / item.quantity : 0) || 0}
                            onCancel={() => setMode('search')}
                            onCreated={handleCreated}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
