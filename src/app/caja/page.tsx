'use client';

import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Banknote, Receipt, Printer, Plus, Minus } from 'lucide-react';
import { emitirBoleta, DTE } from '@/lib/sii-mock';
import BoletaTicket from '@/components/caja/BoletaTicket';
import RouteGuard from '@/components/auth/RouteGuard';

interface Product {
    id: number;
    name: string;
    price: number;
    stock: number;
    requiresPrescription: boolean;
}

const MOCK_PRODUCTS: Product[] = [
    { id: 1, name: 'Paracetamol 500mg', price: 2990, stock: 100, requiresPrescription: false },
    { id: 2, name: 'Ibuprofeno 400mg', price: 3490, stock: 50, requiresPrescription: false },
    { id: 3, name: 'Amoxicilina 500mg', price: 5990, stock: 30, requiresPrescription: true },
    { id: 4, name: 'Loratadina 10mg', price: 1990, stock: 80, requiresPrescription: false },
    { id: 5, name: 'Losartán 50mg', price: 8990, stock: 150, requiresPrescription: false },
];

interface CartItem extends Product {
    quantity: number;
}

export default function CajaPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastTicket, setLastTicket] = useState<DTE | null>(null);
    const [showTicketModal, setShowTicketModal] = useState(false);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }));
    };

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const handlePayment = async () => {
        if (cart.length === 0) return;

        setIsProcessing(true);
        try {
            const ticketItems = cart.map(item => ({
                nombre: item.name,
                cantidad: item.quantity,
                precio: item.price,
                total: item.price * item.quantity
            }));

            const dte = await emitirBoleta(total, ticketItems);
            setLastTicket(dte);
            setShowTicketModal(true);
            setCart([]);
        } catch (error) {
            alert('Error al procesar la venta');
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleNewSale = () => {
        setShowTicketModal(false);
        setLastTicket(null);
        setCart([]);
    };

    const filteredProducts = MOCK_PRODUCTS.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QUIMICO', 'VENDEDOR']}>
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

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
                    <div className="bg-white rounded-xl shadow-sm h-[calc(100vh-2rem)] flex flex-col sticky top-4">
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
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isProcessing ? 'Procesando...' : (
                                    <>
                                        <Receipt />
                                        Emitir Boleta
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Ticket Modal */}
                {showTicketModal && lastTicket && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-lg text-gray-800">Boleta Generada</h3>
                                <button onClick={handleNewSale} className="text-gray-400 hover:text-gray-600">
                                    <span className="sr-only">Cerrar</span>
                                    ✕
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex justify-center">
                                <div className="shadow-lg">
                                    <BoletaTicket data={lastTicket} />
                                </div>
                            </div>

                            <div className="p-4 border-t bg-white grid grid-cols-2 gap-4">
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
        </RouteGuard>
    );
}
