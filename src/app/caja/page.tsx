'use client';

import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Banknote, Receipt, Printer, Plus, Minus, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { emitirBoleta, DTE } from '@/lib/sii-mock';
import TicketBoleta from '@/components/ticket/TicketBoleta';
import RouteGuard from '@/components/auth/RouteGuard';
import { useCartStore } from '@/lib/store/cart';
import { useOfflineSales } from '@/lib/store/offlineSales';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { useAuthStore } from '@/lib/store/useAuthStore'; // Use centralized auth store
import { usePharmaStore } from '@/presentation/store/useStore'; // Use centralized pharma store for context

// Server Actions
import { getActiveSession } from '@/actions/terminals-v2';
import { findBestBatchSecure } from '@/actions/inventory-v2';
import { createSaleSecure } from '@/actions/sales-v2';
import { getProductsSecure } from '@/actions/get-products-v2';

export default function CajaPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastTicket, setLastTicket] = useState<DTE | null>(null);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DEBIT' | 'CREDIT'>('CASH');

    // Session State
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionInfo, setSessionInfo] = useState<{ terminalName: string; openedAt: Date } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Search Results
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const { cart, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal } = useCartStore();
    const { pendingSales, addOfflineSale, clearOfflineSales } = useOfflineSales();
    const isOnline = useNetworkStatus();

    // Auth & Context
    const { user } = useAuthStore();
    const { currentTerminalId, currentLocationId } = usePharmaStore();

    // LocalStorage Session Recovery Hook
    const [localTerminalId, setLocalTerminalId] = useState<string | null>(null);
    const [localLocationId, setLocalLocationId] = useState<string | null>(null);

    // Hydration fix + LocalStorage recovery
    const [isHydrated, setIsHydrated] = useState(false);
    useEffect(() => {
        setIsHydrated(true);
        // Recover from localStorage if store is empty
        if (typeof window !== 'undefined') {
            const metadataStr = localStorage.getItem('pos_session_metadata');
            if (metadataStr) {
                try {
                    const metadata = JSON.parse(metadataStr);
                    if (metadata.terminalId) {
                        setLocalTerminalId(metadata.terminalId);
                        console.log('📦 [Caja] Recovered terminalId from localStorage:', metadata.terminalId);
                    }
                } catch (e) { /* ignore */ }
            }
            // Also check for location from the main context
            const storedLocation = localStorage.getItem('current_location_id');
            if (storedLocation) {
                setLocalLocationId(storedLocation);
            }
        }
    }, []);

    // Effective IDs (prefer store, fallback to localStorage)
    // Effective IDs (prefer store, fallback to localStorage)
    const effectiveTerminalId = currentTerminalId || localTerminalId;
    const effectiveLocationId = currentLocationId || localLocationId;

    // Security: Clear cart on location switch to prevent cross-branch batches
    useEffect(() => {
        if (effectiveLocationId) {
            const stored = localStorage.getItem('cart_location_id');
            if (stored && stored !== effectiveLocationId && cart.length > 0) {
                clearCart();
                console.log('🧹 Carrito limpiado por cambio de sucursal');
            }
            localStorage.setItem('cart_location_id', effectiveLocationId);
        }
    }, [effectiveLocationId, clearCart, cart.length]);

    // 1. Validar Sesión Activa
    useEffect(() => {
        const checkSession = async () => {
            if (!effectiveTerminalId) return;

            try {
                const res = await getActiveSession(effectiveTerminalId);
                if (res.success && res.data) {
                    setSessionId(res.data.sessionId);
                    setSessionInfo({
                        terminalName: res.data.terminalName,
                        openedAt: new Date(res.data.openedAt)
                    });
                    setError(null);
                } else {
                    setSessionId(null);
                    setSessionInfo(null);
                    setError(res.error || 'Caja cerrada. Abra turno para comenzar.');
                }
            } catch (err) {
                console.error(err);
                setError('Error verificando sesión de caja');
            }
        };

        if (isHydrated && effectiveTerminalId) {
            checkSession();
        }
    }, [isHydrated, effectiveTerminalId]);

    // 2. Búsqueda de Productos (Debounced or on Enter)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.trim().length >= 2 && effectiveLocationId) {
                setIsSearching(true);
                try {
                    const res = await getProductsSecure(searchTerm, effectiveLocationId);
                    if (res.success && res.data) {
                        setSearchResults(res.data);
                    }
                } catch (err) {
                    console.error('Search error:', err);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, currentLocationId]);

    // 3. Agregar al Carrito (Resolviendo Batch)
    const handleAddToCart = async (product: any) => {
        if (!effectiveLocationId) {
            alert('Error: Sin ubicación seleccionada');
            return;
        }

        setIsProcessing(true);
        try {
            // Find best batch (FIFO)
            const batchRes = await findBestBatchSecure(product.sku, effectiveLocationId);

            if (batchRes.success && batchRes.batch) {
                addToCart({
                    id: product.id, // Keep product ID for display
                    batchId: batchRes.batch.id, // Store real batch ID
                    name: product.name,
                    price: batchRes.batch.price, // Use real batch price
                    stock: batchRes.batch.quantity,
                    requiresPrescription: false // TODO: Add to DB schema
                });
                setSearchTerm(''); // Clear search to be ready for next scan
                setSearchResults([]);
            } else {
                alert(batchRes.error || 'Sin stock disponible');
            }
        } catch (err) {
            console.error(err);
            alert('Error al agregar producto');
        } finally {
            setIsProcessing(false);
        }
    };

    const total = getCartTotal();

    // 4. Procesar Pago (Venta Real)
    const handlePayment = async () => {
        if (cart.length === 0) return;
        if (!sessionId || !effectiveTerminalId || !user?.id || !effectiveLocationId) {
            alert('Error: Sesión no válida o faltan datos de contexto');
            return;
        }

        setIsProcessing(true);
        try {
            // Prepare Items
            const saleItems = cart.map(item => ({
                batch_id: item.batchId || '', // Must have batchId now
                quantity: item.quantity,
                price: item.price,
                stock: item.stock
            }));

            // Validate batchIds
            if (saleItems.some(i => !i.batch_id)) {
                throw new Error('Hay productos sin lote asignado en el carrito (legacy data). Limpie el carro e intente de nuevo.');
            }

            // A. Online Sale (Primary)
            if (isOnline) {
                const res = await createSaleSecure({
                    locationId: effectiveLocationId,
                    terminalId: effectiveTerminalId,
                    sessionId: sessionId,
                    userId: String(user.id),
                    items: saleItems,
                    paymentMethod: paymentMethod,
                    dteType: 'BOLETA'
                });

                if (res.success && res.saleId) {
                    // B. Emitir Boleta (SII Mock)
                    const ticketItems = cart.map(item => ({
                        nombre: item.name,
                        cantidad: item.quantity,
                        precio: item.price,
                        total: item.price * item.quantity
                    }));

                    const dte = await emitirBoleta(total, ticketItems); // Use real sale total?
                    setLastTicket(dte);
                    setShowTicketModal(true);
                    clearCart();
                } else {
                    alert(`Error en venta: ${res.error || 'Desconocido'}`);
                    if (res.stockErrors) {
                        console.table(res.stockErrors);
                        alert('Problemas de stock detectados. Revise consola.');
                    }
                }
            } else {
                // Offline Fallback
                addOfflineSale(cart, total);
                alert('Sin conexión. Venta guardada localmente.');
                clearCart();
            }

        } catch (error: any) {
            console.error(error);
            alert(`Error procesando venta: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSync = async () => {
        // Implement sync logic
        alert('Sincronización manual no implementada en esta vista aún.');
    };

    const handlePrint = () => {
        window.print();
    };

    const handleNewSale = () => {
        setShowTicketModal(false);
        setLastTicket(null);
        clearCart();
    };

    if (!isHydrated) return null;

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF', 'VENDEDOR']}>
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-7xl mx-auto">
                    {/* Header / Status Bar */}
                    <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                🛒 Punto de Venta
                            </h1>
                            {sessionInfo ? (
                                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    Caja Abierta: {sessionInfo.terminalName}
                                </span>
                            ) : (
                                <span className="text-sm text-red-500 font-medium flex items-center gap-1">
                                    <AlertCircle size={14} />
                                    {error || 'Caja Cerrada'}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <SyncStatusBadge />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Product Search & Catalog */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Escanear código o buscar nombre..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                    {isSearching && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <RefreshCw className="animate-spin text-blue-500" size={16} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Results Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {searchResults.map(product => (
                                    <button
                                        key={product.id}
                                        onClick={() => handleAddToCart(product)}
                                        disabled={isProcessing}
                                        className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all text-left group border border-transparent hover:border-blue-200 flex flex-col gap-1"
                                    >
                                        <div className="font-semibold text-gray-900 group-hover:text-blue-600 truncate w-full">
                                            {product.name}
                                        </div>
                                        <div className="flex justify-between items-end w-full">
                                            <div className="text-gray-500 text-sm">
                                                SKU: {product.sku}
                                                {product.stock !== undefined && (
                                                    <span className={cn("ml-2 font-medium", product.stock > 0 ? "text-green-600" : "text-red-500")}>
                                                        Stock: {product.stock}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-lg font-bold text-blue-600">
                                                ${product.price.toLocaleString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                {searchTerm.length >= 2 && searchResults.length === 0 && !isSearching && (
                                    <div className="col-span-full text-center py-8 text-gray-400">
                                        No se encontraron productos
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cart & Checkout */}
                        <div className="bg-white rounded-xl shadow-sm h-[calc(100vh-8rem)] flex flex-col sticky top-4">
                            <div className="p-4 border-b border-gray-100 bg-blue-50/50 rounded-t-xl">
                                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                                    <ShoppingCart className="text-blue-600" />
                                    Carro de Compra
                                </h2>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {cart.length === 0 ? (
                                    <div className="text-center text-gray-400 py-12 flex flex-col items-center gap-2">
                                        <ShoppingCart size={48} className="opacity-20" />
                                        <p>Escanee productos para comenzar</p>
                                    </div>
                                ) : (
                                    cart.map(item => (
                                        <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-800">{item.name}</div>
                                                <div className="text-xs text-gray-400 font-mono mb-1">{item.batchId?.slice(-8)}</div>
                                                <div className="text-sm text-blue-600 font-bold">
                                                    ${item.price.toLocaleString()} <span className="text-gray-400 font-normal">x {item.quantity}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                                                    <button
                                                        onClick={() => updateQuantity(item.id, -1)}
                                                        className="p-1.5 hover:bg-gray-100 rounded-l-lg text-gray-600"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, 1)}
                                                        className="p-1.5 hover:bg-gray-100 rounded-r-lg text-gray-600"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl space-y-4">
                                <div className="flex justify-between items-center text-2xl font-bold text-gray-900">
                                    <span>Total</span>
                                    <span>${total.toLocaleString()}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">

                                    <button
                                        onClick={() => setPaymentMethod('CASH')}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-3 border rounded-lg transition-all shadow-sm",
                                            paymentMethod === 'CASH'
                                                ? "bg-green-50 border-green-500 text-green-700 ring-1 ring-green-500 font-bold"
                                                : "bg-white border-green-100 text-green-600 hover:bg-green-50"
                                        )}
                                    >
                                        <Banknote size={20} />
                                        Efectivo
                                    </button>
                                    <button
                                        onClick={() => setPaymentMethod('DEBIT')}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-3 border rounded-lg transition-all shadow-sm",
                                            paymentMethod === 'DEBIT'
                                                ? "bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500 font-bold"
                                                : "bg-white border-blue-100 text-blue-600 hover:bg-blue-50"
                                        )}
                                    >
                                        <CreditCard size={20} />
                                        Tarjeta
                                    </button>
                                </div>

                                <button
                                    onClick={handlePayment}
                                    disabled={cart.length === 0 || isProcessing || !sessionId}
                                    className={cn(
                                        "w-full py-4 text-white rounded-xl font-bold text-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]",
                                        isOnline ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-orange-500 hover:bg-orange-600"
                                    )}
                                >
                                    {isProcessing ? (
                                        <>
                                            <RefreshCw className="animate-spin" />
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <Receipt />
                                            {isOnline ? 'Confirmar Pago' : 'Guardar Offline'}
                                        </>
                                    )}
                                </button>
                                {!sessionId && (
                                    <p className="text-xs text-center text-red-500">Debe abrir caja para vender</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Ticket Modal */}
                    {showTicketModal && lastTicket && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static">
                            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] print:shadow-none print:max-w-none print:max-h-none print:w-auto print:rounded-none">
                                <div className="p-4 border-b flex justify-between items-center bg-gray-50 print:hidden">
                                    <h3 className="font-bold text-lg text-gray-800">Boleta Generada</h3>
                                    <button onClick={handleNewSale} className="text-gray-400 hover:text-gray-600">
                                        <span className="sr-only">Cerrar</span>
                                        ✕
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                                    <div className="shadow-lg print:shadow-none bg-white">
                                        <TicketBoleta data={lastTicket} />
                                    </div>
                                </div>

                                <div className="p-4 border-t bg-white grid grid-cols-2 gap-4 print:hidden">
                                    <button
                                        onClick={handleNewSale}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                                    >
                                        <Plus size={20} />
                                        Nueva Venta
                                    </button>
                                    <button
                                        onClick={handlePrint}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                                    >
                                        <Printer size={20} />
                                        Imprimir
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </RouteGuard>
    );
}
