'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Loader2, Package, MapPin, Receipt, Plus, Minus } from 'lucide-react';
import { searchProductForPOS, processSale, CartItem } from '@/actions/sales/pos-actions';
import { usePharmaStore } from '@/presentation/store/useStore';

export default function POSPage() {
    // --- State ---
    const [branch, setBranch] = useState<'SANTIAGO' | 'COLCHAGUA'>('SANTIAGO');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSearching, startSearch] = useTransition();
    const [isProcessing, startProcessing] = useTransition();
    const [lastSaleId, setLastSaleId] = useState<string | null>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);

    // --- Actions ---
    const handleSearch = (term: string) => {
        setQuery(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }

        startSearch(async () => {
            const results = await searchProductForPOS(term, branch);
            setSearchResults(results);
        });
    };

    const addToCart = (product: any) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                // Check local stock limit (rough client-side check)
                if (existing.quantity >= product.stock) {
                    alert('Stock máximo alcanzado para este producto');
                    return prev;
                }
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                id: product.id,
                productName: product.name,
                sku: product.sku,
                unitPrice: product.price,
                quantity: 1
            }];
        });
        setQuery('');
        setSearchResults([]);
        if (searchInputRef.current) searchInputRef.current.focus();
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.quantity + delta);
                // We should also check max stock, but we need reference to original product. 
                // For MVP, server validates.
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const handleCheckout = () => {
        if (cart.length === 0) return;

        const confirmMsg = `¿Confirmar venta por ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(cartTotal)}?`;
        if (!confirm(confirmMsg)) return;

        startProcessing(async () => {
            const result = await processSale(cart, branch);
            if (result.success) {
                setLastSaleId(result.saleId);
                setCart([]);
                alert('✅ Venta registrada con éxito');
            } else {
                alert(`❌ Error: ${result.message}`);
            }
        });
    };

    // --- Derived ---
    const cartTotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    // --- Key Down for Barcode Scanner ---
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchResults.length > 0) {
            // Auto add first result if exact match logic desired, OR just select first
            // For now, let user click or tab.
            // If only 1 result, auto-add?
            if (searchResults.length === 1) {
                addToCart(searchResults[0]);
            }
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* LEFT: Search & Results */}
            <div className="flex-1 flex flex-col p-6 min-w-0">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <CreditCard className="text-blue-600" />
                        Punto de Venta
                    </h1>

                    {/* Branch Switcher */}
                    <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                        {(['SANTIAGO', 'COLCHAGUA'] as const).map(b => (
                            <button
                                key={b}
                                onClick={() => { setBranch(b); setCart([]); setSearchResults([]); setQuery(''); }}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${branch === b
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-500 hover:bg-slate-50'
                                    }`}
                            >
                                {b}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative mb-6 z-20">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="w-full text-xl p-4 pl-12 rounded-xl border-2 border-slate-200 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                        placeholder="Escanear código o buscar nombre..."
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                    {isSearching && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
                    )}
                </div>

                {/* Results Grid */}
                <div className="flex-1 overflow-y-auto pr-2 pb-20">
                    {searchResults.length > 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {searchResults.map((product) => (
                                <button
                                    key={product.id}
                                    onClick={() => addToCart(product)}
                                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 hover:scale-[1.02] transition-all text-left flex flex-col h-full group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
                                            <Package size={20} />
                                        </div>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            Stock: {product.stock}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-slate-800 line-clamp-2 mb-auto" title={product.name}>
                                        {product.name}
                                    </h3>
                                    <div className="mt-4 pt-4 border-t border-slate-100 w-full flex justify-between items-end">
                                        <div className="text-xs text-slate-400">
                                            SKU: {product.sku || 'N/A'}
                                        </div>
                                        <div className="text-lg font-bold text-blue-700">
                                            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(product.price)}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        query.length > 2 && !isSearching && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Search size={48} className="mb-4 opacity-20" />
                                <p>No se encontraron productos en {branch}</p>
                            </div>
                        )
                    )}

                    {searchResults.length === 0 && query.length < 2 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <CreditCard size={40} />
                            </div>
                            <p className="font-medium">Listo para vender</p>
                            <p className="text-sm">Escanea un producto para comenzar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Cart & Checkout */}
            <div className="w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col z-30">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <ShoppingCart size={20} />
                        Carrito de Compra
                    </h2>
                    <div className="text-sm text-slate-500 mt-1">
                        {cart.length} productos
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.map((item) => (
                        <div key={item.id} className="flex gap-3 bg-white border border-slate-100 p-3 rounded-lg hover:border-blue-200 transition-colors">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-sm truncate" title={item.productName}>
                                    {item.productName}
                                </p>
                                <p className="text-xs text-slate-400 mb-2">
                                    {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.unitPrice)} c/u
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center bg-slate-100 rounded-lg">
                                        <button
                                            onClick={() => updateQuantity(item.id, -1)}
                                            className="p-1 hover:bg-slate-200 rounded-l-lg transition-colors"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                                        <button
                                            onClick={() => updateQuantity(item.id, 1)}
                                            className="p-1 hover:bg-slate-200 rounded-r-lg transition-colors"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="text-red-400 hover:text-red-600 p-1"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col justify-between items-end">
                                <span className="font-bold text-slate-700">
                                    {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.unitPrice * item.quantity)}
                                </span>
                            </div>
                        </div>
                    ))}

                    {cart.length === 0 && (
                        <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                            <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm">El carrito está vacío</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-2 text-slate-500">
                        <span>Subtotal</span>
                        <span>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-6 text-2xl font-black text-slate-900">
                        <span>Total</span>
                        <span>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(cartTotal)}</span>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || isProcessing}
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95
                            ${cart.length > 0 && !isProcessing
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }
                        `}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" /> Procesando...
                            </>
                        ) : (
                            <>
                                <Receipt /> Finalizar Venta
                            </>
                        )}
                    </button>
                    {lastSaleId && !isProcessing && (
                        <p className="text-center text-xs text-green-600 font-bold mt-2 animate-pulse">
                            Última venta: {lastSaleId.slice(0, 8)}...
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
