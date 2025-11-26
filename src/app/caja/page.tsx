'use client';

import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Banknote, Receipt, Printer, Plus, Minus, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { emitirBoleta, DTE } from '@/lib/sii-mock';
import TicketBoleta from '@/components/ticket/TicketBoleta';
import RouteGuard from '@/components/auth/RouteGuard';
import { useCartStore, Product } from '@/lib/store/cart';
import { useOfflineSales } from '@/lib/store/offlineSales';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

const MOCK_PRODUCTS: Product[] = [
    { id: 1, name: 'Paracetamol 500mg', price: 2990, stock: 100, requiresPrescription: false },
    { id: 2, name: 'Ibuprofeno 400mg', price: 3490, stock: 50, requiresPrescription: false },
    { id: 3, name: 'Amoxicilina 500mg', price: 5990, stock: 30, requiresPrescription: true },
    { id: 4, name: 'Loratadina 10mg', price: 1990, stock: 80, requiresPrescription: false },
    { id: 5, name: 'Losartán 50mg', price: 8990, stock: 150, requiresPrescription: false },
];

export default function CajaPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastTicket, setLastTicket] = useState<DTE | null>(null);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const { cart, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal } = useCartStore();
    const { pendingSales, addOfflineSale, clearOfflineSales } = useOfflineSales();
    const isOnline = useNetworkStatus();

    // Hydration fix for persisted stores
    const [isHydrated, setIsHydrated] = useState(false);
    useEffect(() => {
        setIsHydrated(true);
    }, []);

    const total = getCartTotal();

    const handlePayment = async () => {
        if (cart.length === 0) return;

        setIsProcessing(true);
        try {
            if (!isOnline) {
                // Offline Mode: Save to queue
                addOfflineSale(cart, total);
                alert('Sin conexión. Venta guardada localmente para sincronización posterior.');
                clearCart();
                return;
            }

            // Online Mode: Try to emit boleta
            const ticketItems = cart.map(item => ({
                nombre: item.name,
                cantidad: item.quantity,
                precio: item.price,
                total: item.price * item.quantity
            }));

            const dte = await emitirBoleta(total, ticketItems);
            setLastTicket(dte);
            setShowTicketModal(true);
            clearCart();
        } catch (error) {
            console.error(error);
            // If API fails, fallback to offline save?
            // For now, just alert error or ask user.
            // Let's assume network error means offline save.
            const confirmOffline = window.confirm('Error de conexión con SII. ¿Guardar venta localmente?');
            if (confirmOffline) {
                addOfflineSale(cart, total);
                clearCart();
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSync = async () => {
        if (pendingSales.length === 0) return;
        setSyncing(true);
        try {
            // Simulate syncing each sale
            for (const sale of pendingSales) {
                const ticketItems = sale.items.map(item => ({
                    nombre: item.name,
                    cantidad: item.quantity,
                    precio: item.price,
                    total: item.price * item.quantity
                }));
                await emitirBoleta(sale.total, ticketItems);
            }
            clearOfflineSales();
            alert('Sincronización completada exitosamente.');
        } catch (error) {
            alert('Error durante la sincronización. Intente nuevamente.');
        } finally {
            setSyncing(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleNewSale = () => {
        setShowTicketModal(false);
        setLastTicket(null);
        clearCart();
    };

    const filteredProducts = MOCK_PRODUCTS.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isHydrated) return null; // Prevent hydration mismatch

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF', 'VENDEDOR']}>
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-7xl mx-auto">
                    {/* Header / Status Bar */}
                    <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            🛒 Punto de Venta
                        </h1>
                        <div className="flex items-center gap-4">
                            {/* Call Next Ticket Button */}
                            <button
                                onClick={async () => {
                                    try {
                                        const { getNextTicket } = await import('@/actions/operations');
                                        const res = await getNextTicket(1); // Assuming counter 1 for now
                                        if (res.success && res.ticket) {
                                            alert(`Llamando a ticket: ${res.ticket.numero_ticket}`);
                                            // Optional: Speak the number
                                            const msg = new SpeechSynthesisUtterance(`Atención, número ${res.ticket.numero_ticket}, pase a caja.`);
                                            window.speechSynthesis.speak(msg);
                                        } else {
                                            alert(res.message || res.error || 'No hay clientes en espera');
                                        }
                                    } catch (error) {
                                        console.error(error);
                                        alert('Error al llamar siguiente número');
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-sm"
                            >
                                <span className="text-xl">📢</span>
                                <span className="hidden sm:inline">Llamar Siguiente</span>
                            </button>

                            {/* Network Status */}
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                                isOnline ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                            )}>
                                {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                                {isOnline ? "Online" : "Modo Offline"}
                            </div>

                            {/* Pending Sales Sync */}
                            {pendingSales.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-orange-600 font-medium">
                                        {pendingSales.length} pendiente(s)
                                    </span>
                                    <button
                                        onClick={handleSync}
                                        disabled={!isOnline || syncing}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw size={16} className={cn(syncing && "animate-spin")} />
                                        {syncing ? 'Sincronizando...' : 'Sincronizar'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Product Catalog */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {filteredProducts.map(product => (
                                    <button
                                        key={product.id}
                                        onClick={() => addToCart(product)}
                                        className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all text-left group"
                                    >
                                        <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                                            {product.name}
                                        </div>
                                        <div className="text-gray-500 text-sm mt-1">
                                            Stock: {product.stock}
                                        </div>
                                        <div className="text-lg font-bold text-blue-600 mt-2">
                                            ${product.price.toLocaleString()}
                                        </div>
                                        {product.requiresPrescription && (
                                            <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                                Receta
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cart & Checkout */}
                        <div className="bg-white rounded-xl shadow-sm h-[calc(100vh-8rem)] flex flex-col sticky top-4">
                            <div className="p-4 border-b border-gray-100">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <ShoppingCart className="text-blue-600" />
                                    Carro de Compra
                                </h2>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {cart.length === 0 ? (
                                    <div className="text-center text-gray-400 py-8">
                                        Carro vacío
                                    </div>
                                ) : (
                                    cart.map(item => (
                                        <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                            <div className="flex-1">
                                                <div className="font-medium">{item.name}</div>
                                                <div className="text-sm text-gray-500">
                                                    ${item.price.toLocaleString()} x {item.quantity}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200">
                                                    <button
                                                        onClick={() => updateQuantity(item.id, -1)}
                                                        className="p-1 hover:bg-gray-100 rounded-l-lg"
                                                    >
                                                        <Minus size={16} />
                                                    </button>
                                                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, 1)}
                                                        className="p-1 hover:bg-gray-100 rounded-r-lg"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                                <div className="flex justify-between items-center mb-4 text-lg font-bold">
                                    <span>Total</span>
                                    <span>${total.toLocaleString()}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <button className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                        <Banknote size={20} className="text-green-600" />
                                        Efectivo
                                    </button>
                                    <button className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                        <CreditCard size={20} className="text-blue-600" />
                                        Tarjeta
                                    </button>
                                </div>

                                <button
                                    onClick={handlePayment}
                                    disabled={cart.length === 0 || isProcessing}
                                    className={cn(
                                        "w-full py-4 text-white rounded-xl font-bold text-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors",
                                        isOnline ? "bg-blue-600 hover:bg-blue-700" : "bg-orange-500 hover:bg-orange-600"
                                    )}
                                >
                                    {isProcessing ? 'Procesando...' : (
                                        <>
                                            <Receipt />
                                            {isOnline ? 'Emitir Boleta' : 'Guardar Offline'}
                                        </>
                                    )}
                                </button>
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
                                    <div className="shadow-lg print:shadow-none">
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
