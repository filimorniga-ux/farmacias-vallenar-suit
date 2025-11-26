'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, X, Tag, CreditCard, Banknote, Smartphone, AlertTriangle, ShoppingCart, PlusCircle, Coins, DollarSign, Lock as LockIcon, Edit, TrendingDown, TrendingUp, Wallet, User, Bot, AlertOctagon, Snowflake } from 'lucide-react';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import ClientPanel from './pos/ClientPanel';
import PrescriptionModal from './pos/PrescriptionModal';
import ManualItemModal from './pos/ManualItemModal';
import CashManagementModal from './pos/CashManagementModal';
import CashOutModal from './pos/CashOutModal';
import { CartItem } from '../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

import { useKioskGuard } from '../hooks/useKioskGuard';
import SafeExitButton from './security/SafeExitButton';
import { PrinterService } from '../../domain/services/PrinterService';
import CustomerCaptureModal from './pos/CustomerCaptureModal';
import { toast } from 'sonner';
import { shouldGenerateDTE } from '../../domain/logic/sii_dte';

const POSMainScreen: React.FC = () => {
    useKioskGuard(true); // Enable Kiosk Lock
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        processSale, currentCustomer, currentShift, getShiftMetrics, updateOpeningAmount, employees, printerConfig,
        setCustomer
    } = usePharmaStore();

    const metrics = getShiftMetrics();
    const [isEditBaseModalOpen, setIsEditBaseModalOpen] = useState(false);
    const [supervisorPin, setSupervisorPin] = useState('');
    const [newBaseAmount, setNewBaseAmount] = useState('');
    const [editBaseError, setEditBaseError] = useState('');

    const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
    const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
    const [isCustomerCaptureModalOpen, setIsCustomerCaptureModalOpen] = useState(false);
    const [pendingItemForPrescription, setPendingItemForPrescription] = useState<CartItem | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DEBIT' | 'TRANSFER'>('CASH');
    const [transferId, setTransferId] = useState('');

    // Sidebar Tabs State
    const [activeTab, setActiveTab] = useState<'CART' | 'CLIENT' | 'AI'>('CART');

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
    const clinicalAnalysis = useMemo(() => ClinicalAgent.analyzeCart(cart, currentCustomer || undefined), [cart, currentCustomer]);
    const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // AI Alert Logic
    useEffect(() => {
        if (clinicalAnalysis.status === 'WARNING' || clinicalAnalysis.status === 'BLOCK') {
            setActiveTab('AI'); // Auto-switch to AI tab on alert
        }
    }, [clinicalAnalysis.status]);

    // Check for Restricted Items (R/RR/RCH)
    const isRestricted = (item: CartItem) => {
        const inventoryItem = inventory.find(i => i.id === item.id);
        return inventoryItem && (inventoryItem.condition === 'R' || inventoryItem.condition === 'RR' || inventoryItem.condition === 'RCH');
    };
    const hasRestrictedItems = cart.some(isRestricted);

    const proceedToPaymentFlow = () => {
        if (hasRestrictedItems) {
            setIsPrescriptionModalOpen(true);
        } else {
            setIsPaymentModalOpen(true);
        }
    };

    const handlePrePayment = () => {
        if (cart.length === 0) return;

        if (!currentCustomer) {
            setIsCustomerCaptureModalOpen(true);
        } else {
            proceedToPaymentFlow();
        }
    };

    const handleCustomerCaptured = (customerRut: string) => {
        // Find customer in store (it should be there, added by modal if new)
        const { customers } = usePharmaStore.getState();
        const customer = customers.find(c => c.rut === customerRut);
        if (customer) {
            setCustomer(customer);
        }
        setIsCustomerCaptureModalOpen(false);
        proceedToPaymentFlow();
    };

    const handleCustomerSkip = () => {
        setIsCustomerCaptureModalOpen(false);
        proceedToPaymentFlow();
    };

    const handlePrescriptionConfirm = (data: { folio: string, doctorRut: string }) => {
        setIsPrescriptionModalOpen(false);
        setIsPaymentModalOpen(true); // Proceed to payment
        // In a real app, we would store prescription data in the transaction here
    };

    const handleCheckout = () => {
        if (cart.length === 0) return;
        if (!currentShift || currentShift.status === 'CLOSED') {
            toast.error('Debe abrir caja antes de vender.');
            return;
        }
        if (paymentMethod === 'TRANSFER' && !transferId) {
            toast.error('Debe ingresar el ID de transacción');
            return;
        }

        // Determine DTE Status
        const dteResult = shouldGenerateDTE(paymentMethod);
        const dteFolio = dteResult.shouldGenerate ? Math.floor(Math.random() * 100000).toString() : undefined; // Mock Folio

        // Capture sale data before processing (since cart clears)
        const saleToPrint: any = {
            id: `V-${Date.now()}`, // Mock ID, ideally returned by processSale
            timestamp: Date.now(),
            items: [...cart],
            total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
            payment_method: paymentMethod,
            customer: currentCustomer || undefined,
            transfer_id: paymentMethod === 'TRANSFER' ? transferId : undefined,
            dte_status: dteResult.status,
            dte_folio: dteFolio
        };

        processSale(paymentMethod, currentCustomer || undefined);

        // Auto-Print Trigger
        PrinterService.printTicket(saleToPrint, printerConfig);

        setIsPaymentModalOpen(false);
        setTransferId('');
        setPaymentMethod('CASH');

        if (dteResult.shouldGenerate) {
            toast.success(`¡Venta Exitosa! Boleta Nº ${dteFolio} generada.`, { duration: 3000 });
        } else {
            toast.success('¡Venta Exitosa! Fiscalizada por Voucher.', { duration: 3000 });
        }
    };

    const getExpiryStatus = (timestamp: number) => {
        const months = (timestamp - Date.now()) / (1000 * 60 * 60 * 24 * 30);
        if (months < 3) return 'border-amber-400 bg-amber-50';
        return 'border-slate-100 bg-white';
    };

    const handleUpdateBase = () => {
        const supervisor = employees.find(e => (e.role === 'MANAGER' || e.role === 'ADMIN') && e.access_pin === supervisorPin);
        if (supervisor) {
            updateOpeningAmount(Number(newBaseAmount));
            setIsEditBaseModalOpen(false);
            setSupervisorPin('');
            setNewBaseAmount('');
            setEditBaseError('');
            alert('Base actualizada correctamente');
        } else {
            setEditBaseError('PIN no autorizado');
        }
    };

    return (
        <div className="flex h-[calc(100vh-80px)] bg-slate-100 overflow-hidden">

            {/* COL 1: Catálogo (70%) */}
            <div className="flex-1 flex flex-col p-6 pr-3">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Catálogo</h2>
                            <p className="text-xs text-slate-400">{filteredInventory.length} productos disponibles</p>
                        </div>
                        <div className="flex-1 relative max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por Nombre, SKU o DCI..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors font-medium"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsManualItemModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-3 rounded-xl hover:bg-purple-200 font-bold transition-colors"
                        >
                            <Plus size={20} />
                            <span className="hidden xl:inline">Item Manual</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                        {filteredInventory.map(item => (
                            <div
                                key={item.id}
                                onClick={() => addToCart(item, 1)}
                                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-cyan-200 cursor-pointer transition-all group flex flex-col justify-between h-full"
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                            {item.location_id}
                                        </span>
                                        <div className="flex gap-1">
                                            {item.storage_condition === 'REFRIGERADO' && (
                                                <span className="p-1 bg-cyan-100 text-cyan-600 rounded-lg" title="Cadena de Frío">
                                                    <Snowflake size={12} />
                                                </span>
                                            )}
                                            {item.condition === 'R' && <span className="p-1 bg-purple-100 text-purple-600 rounded-lg text-[10px] font-bold">R</span>}
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-cyan-600 transition-colors line-clamp-2">
                                        {item.name}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-mono mb-2">{item.dci}</p>

                                    {/* Clinical Tags */}
                                    {item.therapeutic_tags && item.therapeutic_tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {item.therapeutic_tags.slice(0, 2).map(tag => (
                                                <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-100">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between items-end mt-2">
                                    <div>
                                        <p className="text-[10px] text-slate-400 mb-0.5">Precio</p>
                                        <span className="font-bold text-lg text-slate-800">${item.price.toLocaleString()}</span>
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.stock_actual > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        Stock: {item.stock_actual}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* COL 2: Smart Sidebar (30% - Fixed Width) */}
            <div className="w-[400px] flex flex-col p-6 pl-0 gap-4">

                {/* Cash Monitor Widget (Compact) */}
                <div className="bg-slate-900 rounded-3xl p-4 text-white shadow-xl relative overflow-hidden shrink-0">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <Wallet size={16} className="text-cyan-400" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Caja</span>
                        </div>
                        <button
                            onClick={() => setIsCashModalOpen(true)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 ${currentShift?.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                        >
                            {currentShift?.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                        </button>
                    </div>
                    <div className="flex justify-between items-end">
                        <div>
                            <span className="text-2xl font-extrabold text-white">${metrics.expectedCash.toLocaleString()}</span>
                            <p className="text-[10px] text-slate-400">Efectivo Teórico</p>
                        </div>
                        <div className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                <span className="font-bold text-slate-300">${metrics.initialFund.toLocaleString()}</span>
                                <button onClick={() => setIsEditBaseModalOpen(true)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                                    <Edit size={12} className="text-cyan-400" />
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500">Base Inicial</p>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                    <button
                        onClick={() => setIsCashOutModalOpen(true)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-200 text-[10px] font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        <DollarSign size={14} /> RETIRO / GASTO
                    </button>
                    <button
                        onClick={() => setIsCashModalOpen(true)}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-200 text-[10px] font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        <Wallet size={14} /> GESTIÓN CAJA
                    </button>
                </div>

                {/* Smart Tabs */}
                <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Tab Headers */}
                    <div className="flex border-b border-slate-100">
                        <button
                            onClick={() => setActiveTab('CART')}
                            className={`flex-1 py-4 flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'CART' ? 'border-cyan-500 text-cyan-600 bg-cyan-50/50' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
                        >
                            <div className="relative">
                                <ShoppingCart size={20} />
                                {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-cyan-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{cart.length}</span>}
                            </div>
                            <span className="text-[10px] font-bold">CARRITO</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('CLIENT')}
                            className={`flex-1 py-4 flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'CLIENT' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
                        >
                            <User size={20} />
                            <span className="text-[10px] font-bold">CLIENTE</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('AI')}
                            className={`flex-1 py-4 flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === 'AI' ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
                        >
                            <div className="relative">
                                <Bot size={20} className={clinicalAnalysis.status !== 'SAFE' ? 'text-amber-500 animate-pulse' : ''} />
                                {clinicalAnalysis.status !== 'SAFE' && <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">!</span>}
                            </div>
                            <span className="text-[10px] font-bold">COPILOT</span>
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            {activeTab === 'CART' && (
                                <motion.div
                                    key="cart"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="absolute inset-0 flex flex-col"
                                >
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
                                                        <h4 className="font-bold text-slate-700 text-sm line-clamp-1">{item.name}</h4>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs text-slate-500">{item.quantity} x ${item.price.toLocaleString()}</span>
                                                            {item.allows_commission && (
                                                                <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200" title="Comisionable">
                                                                    <Coins size={10} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold text-slate-900">${(item.price * item.quantity).toLocaleString()}</span>
                                                        <button onClick={() => removeFromCart(item.sku)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'CLIENT' && (
                                <motion.div
                                    key="client"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="absolute inset-0 p-4 overflow-y-auto"
                                >
                                    <ClientPanel />
                                </motion.div>
                            )}

                            {activeTab === 'AI' && (
                                <motion.div
                                    key="ai"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="absolute inset-0 p-4 overflow-y-auto"
                                >
                                    <ClinicalSidebar analysis={clinicalAnalysis} lastChecked={Date.now()} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer Totals & Actions */}
                    <div className="p-6 bg-slate-50 border-t border-slate-200 z-10">
                        {/* Toast Notification for AI Alert */}
                        <AnimatePresence>
                            {activeTab !== 'AI' && clinicalAnalysis.status !== 'SAFE' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    className={`absolute bottom-[140px] left-4 right-4 p-3 rounded-xl shadow-lg flex items-center gap-3 cursor-pointer ${clinicalAnalysis.status === 'BLOCK' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}
                                    onClick={() => setActiveTab('AI')}
                                >
                                    <AlertOctagon size={20} />
                                    <div className="flex-1">
                                        <p className="text-xs font-bold">Alerta Clínica Detectada</p>
                                        <p className="text-[10px] opacity-90 line-clamp-1">{clinicalAnalysis.message}</p>
                                    </div>
                                    <div className="bg-white/20 p-1 rounded">
                                        <TrendingUp size={12} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex justify-between items-end mb-4">
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

            <CashOutModal
                isOpen={isCashOutModalOpen}
                onClose={() => setIsCashOutModalOpen(false)}
            />

            {/* Edit Base Modal */}
            {isEditBaseModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">Ajustar Base Inicial</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Nuevo Monto Base</label>
                                <input
                                    type="number"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold text-lg"
                                    value={newBaseAmount}
                                    onChange={(e) => setNewBaseAmount(e.target.value)}
                                    placeholder="$0"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">PIN Supervisor (Manager)</label>
                                <input
                                    type="password"
                                    maxLength={4}
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold text-lg tracking-widest text-center"
                                    value={supervisorPin}
                                    onChange={(e) => {
                                        setSupervisorPin(e.target.value);
                                        setEditBaseError('');
                                    }}
                                    placeholder="••••"
                                />
                            </div>

                            {editBaseError && <p className="text-red-500 text-sm font-bold text-center">{editBaseError}</p>}

                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button
                                    onClick={() => setIsEditBaseModalOpen(false)}
                                    className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpdateBase}
                                    className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                onClick={handleCheckout}
                                className="w-full py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center justify-center gap-2"
                            >
                                <DollarSign size={20} /> CONFIRMAR PAGO
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Customer Capture Modal */}
            <CustomerCaptureModal
                isOpen={isCustomerCaptureModalOpen}
                onClose={() => setIsCustomerCaptureModalOpen(false)}
                onConfirm={handleCustomerCaptured}
                onSkip={handleCustomerSkip}
            />
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
