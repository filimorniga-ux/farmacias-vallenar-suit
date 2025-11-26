'use client';
import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, X, Tag, CreditCard, Banknote, Smartphone, AlertTriangle, ShoppingCart, PlusCircle, Coins, DollarSign, Lock as LockIcon } from 'lucide-react';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import ClientPanel from './pos/ClientPanel';
import PrescriptionModal from './pos/PrescriptionModal';
import ManualItemModal from './pos/ManualItemModal';
import CashManagementModal from './pos/CashManagementModal';
import { CartItem } from '../../domain/types';

const POSMainScreen: React.FC = () => {
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        processSale, currentCustomer, currentShift
    } = usePharmaStore();

    const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
    const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [pendingItemForPrescription, setPendingItemForPrescription] = useState<CartItem | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DEBIT' | 'TRANSFER'>('CASH');
    const [transferId, setTransferId] = useState('');

    // FEFO Sorting & Filtering
    const filteredInventory = useMemo(() => {
        return inventory
            .filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.dci.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.sku.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => a.expiry_date - b.expiry_date); // FEFO: First Expired, First Out
    }, [inventory, searchTerm]);

    // Clinical Analysis
    const clinicalAnalysis = ClinicalAgent.analyzeCart(cart, currentCustomer || undefined);
    const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Check for Restricted Items (R/RR/RCH)
    const isRestricted = (item: CartItem) => {
        const inventoryItem = inventory.find(i => i.id === item.id);
        return inventoryItem && (inventoryItem.condition === 'R' || inventoryItem.condition === 'RR' || inventoryItem.condition === 'RCH');
    };
    const hasRestrictedItems = cart.some(isRestricted);

    const handlePrePayment = () => {
        if (hasRestrictedItems) {
            setIsPrescriptionModalOpen(true);
        } else {
            setIsPaymentModalOpen(true);
        }
    };

    const handlePrescriptionConfirm = (data: { folio: string, doctorRut: string }) => {
        setIsPrescriptionModalOpen(false);
        setIsPaymentModalOpen(true); // Proceed to payment
        // In a real app, we would store prescription data in the transaction here
    };

    const handlePayment = () => {
        if (paymentMethod === 'TRANSFER' && !transferId) {
            alert('Debe ingresar el ID de transacción');
            return;
        }
        processSale(paymentMethod, currentCustomer || undefined);
        setIsPaymentModalOpen(false);
        setTransferId('');
        alert('¡Venta Exitosa! Boleta generada.');
    };

    const getExpiryStatus = (timestamp: number) => {
        const months = (timestamp - Date.now()) / (1000 * 60 * 60 * 24 * 30);
        if (months < 3) return 'border-amber-400 bg-amber-50';
        return 'border-slate-100 bg-white';
    };

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-80px)] p-6 bg-slate-100">

            {/* COL 1: Catálogo (5 cols) */}
            <div className="col-span-5 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800 mb-4">Catálogo</h2>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por Nombre, SKU o DCI..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 content-start">
                    {filteredInventory.map(item => (
                        <div
                            key={item.id}
                            onClick={() => addToCart(item, 1)}
                            className={`group p-4 rounded-2xl border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${getExpiryStatus(item.expiry_date)}`}
                        >
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.category === 'MEDICAMENTO' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                                        {item.category.substring(0, 3)}
                                    </span>
                                    <span className="text-xs font-mono text-slate-400">{item.sku}</span>
                                </div>
                                <h3 className="font-bold text-slate-700 leading-tight mb-1 group-hover:text-cyan-700 transition-colors">{item.name}</h3>
                                <p className="text-xs text-slate-500 mb-3">{item.dci}</p>
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <ClockIcon size={10} /> Vence: {new Date(item.expiry_date).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <span className="text-lg font-bold text-slate-900">${item.price.toLocaleString('es-CL')}</span>
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                                    <Plus size={16} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* COL 2: Clinical Copilot (3 cols) */}
            <div className="col-span-3 flex flex-col gap-4">
                <ClientPanel />
                <div className="flex-1">
                    <ClinicalSidebar analysis={clinicalAnalysis} lastChecked={Date.now()} />
                </div>
            </div>

            {/* COL 3: Carrito (4 cols) */}
            <div className="col-span-4 flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Carrito Actual</h2>
                        <p className="text-sm text-slate-500">{cart.length} ítems</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsCashModalOpen(true)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${currentShift?.status === 'OPEN'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'
                                }`}
                        >
                            {currentShift?.status === 'OPEN' ? <DollarSign size={18} /> : <LockIcon size={18} />}
                            {currentShift?.status === 'OPEN' ? 'Caja Abierta' : 'Caja Cerrada'}
                        </button>

                        <button
                            onClick={() => setIsManualItemModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 font-medium transition-colors"
                        >
                            <Plus size={18} />
                            Item Manual
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                            <ShoppingCart size={48} className="mb-4" />
                            <p>Carrito vacío</p>
                        </div>
                    ) : (
                        cart.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-700 text-sm">{item.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-500">{item.quantity} x ${item.price.toLocaleString()}</span>
                                        {item.allows_commission && (
                                            <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200" title="Comisionable">
                                                <Coins size={10} /> COMISIÓN
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-slate-900">${(item.price * item.quantity).toLocaleString()}</span>
                                    <button onClick={() => removeFromCart(item.sku)} className="text-slate-400 hover:text-red-500 transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200">
                    <div className="flex justify-between items-end mb-6">
                        <span className="text-slate-500 font-medium">Total a Pagar</span>
                        <span className="text-3xl font-extrabold text-slate-900">${cartTotal.toLocaleString('es-CL')}</span>
                    </div>

                    <button
                        onClick={handlePrePayment}
                        disabled={cart.length === 0 || clinicalAnalysis.status === 'BLOCK'}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                            ${clinicalAnalysis.status === 'BLOCK'
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                            }`}
                    >
                        {clinicalAnalysis.status === 'BLOCK' ? '⛔ VENTA BLOQUEADA' : 'PAGAR AHORA'}
                    </button>
                </div>
            </div>

            {/* Modals */}
            <PrescriptionModal
                isOpen={isPrescriptionModalOpen}
                onCancel={() => setIsPrescriptionModalOpen(false)}
                onConfirm={handlePrescriptionConfirm}
                itemName={pendingItemForPrescription?.name || ''}
            />

            <ManualItemModal
                isOpen={isManualItemModalOpen}
                onClose={() => setIsManualItemModalOpen(false)}
                onConfirm={(item) => { addManualItem(item); setIsManualItemModalOpen(false); }}
            />

            <CashManagementModal
                isOpen={isCashModalOpen}
                onClose={() => setIsCashModalOpen(false)}
            />

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">Finalizar Venta</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)}><X className="text-slate-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-3 gap-4 mb-8">
                                <button
                                    onClick={() => setPaymentMethod('CASH')}
                                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'CASH' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-400'}`}
                                >
                                    <Banknote size={24} />
                                    <span className="text-xs font-bold">EFECTIVO</span>
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('DEBIT')}
                                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'DEBIT' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-400'}`}
                                >
                                    <CreditCard size={24} />
                                    <span className="text-xs font-bold">TARJETA</span>
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('TRANSFER')}
                                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'TRANSFER' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-100 text-slate-400'}`}
                                >
                                    <Smartphone size={24} />
                                    <span className="text-xs font-bold">TRANSF.</span>
                                </button>
                            </div>

                            {paymentMethod === 'TRANSFER' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">ID de Transacción</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-purple-500 focus:outline-none"
                                        placeholder="Ej: 12345678"
                                        value={transferId}
                                        onChange={(e) => setTransferId(e.target.value)}
                                    />
                                    <p className="text-xs text-slate-400 mt-2 flex items-center"><AlertTriangle size={12} className="mr-1" /> Verifique el comprobante antes de confirmar.</p>
                                </div>
                            )}

                            <button
                                onClick={handlePayment}
                                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
                            >
                                Confirmar Pago (${cartTotal.toLocaleString()})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper Icon
const ClockIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

export default POSMainScreen;
