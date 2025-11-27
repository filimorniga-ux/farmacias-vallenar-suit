'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, X, Tag, CreditCard, Banknote, Smartphone, AlertTriangle, ShoppingCart, PlusCircle, Coins, DollarSign, Lock as LockIcon, Edit, TrendingDown, TrendingUp, Wallet, User, Bot, AlertOctagon, Snowflake, ScanBarcode, Scissors } from 'lucide-react';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import ClientPanel from './pos/ClientPanel';
import PrescriptionModal from './pos/PrescriptionModal';
import ManualItemModal from './pos/ManualItemModal';
import CashControlModal from './pos/CashControlModal';
import CashOutModal from './pos/CashOutModal';
import QuickFractionModal from './pos/QuickFractionModal';
import { CartItem, InventoryBatch } from '../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

import { useKioskGuard } from '../hooks/useKioskGuard';
import SafeExitButton from './security/SafeExitButton';
import { PrinterService } from '../../domain/services/PrinterService';
import CustomerCaptureModal from './pos/CustomerCaptureModal';
import { toast } from 'sonner';
import { shouldGenerateDTE } from '../../domain/logic/sii_dte';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { formatProductLabel } from '../../domain/logic/productDisplay';
import { useSettingsStore } from '@/presentation/store/useSettingsStore';

const POSMainScreen: React.FC = () => {
    useKioskGuard(true); // Enable Kiosk Lock
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        processSale, currentCustomer, currentShift, getShiftMetrics, updateOpeningAmount, employees, printerConfig,
        setCustomer
    } = usePharmaStore();

    const { enable_sii_integration } = useSettingsStore();

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
    const [isQuickFractionModalOpen, setIsQuickFractionModalOpen] = useState(false);
    const [selectedProductForFraction, setSelectedProductForFraction] = useState<InventoryBatch | null>(null);
    const [pendingItemForPrescription, setPendingItemForPrescription] = useState<CartItem | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DEBIT' | 'TRANSFER'>('CASH');
    const [transferId, setTransferId] = useState('');

    // Sidebar Tabs State
    const [activeTab, setActiveTab] = useState<'CART' | 'CLIENT' | 'AI'>('CART');

    // Barcode Scanner Integration
    useBarcodeScanner({
        onScan: (sku) => {
            const product = inventory.find(p => p.sku === sku || p.id === sku);
            if (product) {
                addToCart(product, 1);
                toast.success('Producto agregado', { duration: 1000, icon: <ScanBarcode /> });
                // Play beep sound if possible
                const audio = new Audio('/beep.mp3'); // Assuming file exists or just placeholder
                audio.play().catch(() => { });
            } else {
                toast.error('Producto no encontrado');
            }
        }
    });

    // FEFO Sorting & Filtering - ONLY SHOW IF SEARCHING
    const filteredInventory = useMemo(() => {
        if (!searchTerm) return []; // Hide by default
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
        // Simplified flow: Skip customer check if not strictly required, or keep it but make it faster.
        // Prompt 2 says "Elimina el paso intermedio de Asociar Cliente".
        // We will go straight to payment. If customer is needed for R/RR, the PrescriptionModal handles it or we can add it there.
        proceedToPaymentFlow();
    };

    const handlePrescriptionConfirm = (data: { folio: string, doctorRut: string }) => {
        setIsPrescriptionModalOpen(false);
        setIsPaymentModalOpen(true); // Proceed to payment
    };

    const handleCheckout = () => {
        if (cart.length === 0) return;
        if (!currentShift || currentShift.status === 'CLOSED') {
            toast.error('Debe abrir caja antes de vender.');
            return;
        }
        if (paymentMethod === 'TRANSFER' && !transferId) {
            // Optional ID logic: allow empty, will be marked as PENDING
        }

        // Determine DTE Status based on Settings
        let dteResult = { shouldGenerate: false, status: 'FISCALIZED_BY_VOUCHER' as any };
        let dteFolio = undefined;

        if (enable_sii_integration) {
            const check = shouldGenerateDTE(paymentMethod);
            dteResult = { shouldGenerate: check.shouldGenerate, status: check.status };
            dteFolio = dteResult.shouldGenerate ? Math.floor(Math.random() * 100000).toString() : undefined;
        }

        // Capture sale data before processing (since cart clears)
        const saleToPrint: any = {
            id: `V-${Date.now()}`, // Mock ID, ideally returned by processSale
            timestamp: Date.now(),
            items: [...cart],
            total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
            payment_method: paymentMethod,
            customer: currentCustomer || undefined,
            transfer_id: paymentMethod === 'TRANSFER' ? (transferId || 'SIN_ID_PENDIENTE') : undefined,
            dte_status: dteResult.status,
            dte_folio: dteFolio,
            is_internal_ticket: !enable_sii_integration // Flag for template
        };

        processSale(paymentMethod, currentCustomer || undefined);

        // Auto-Print Trigger
        PrinterService.printTicket(saleToPrint, printerConfig);

        setIsPaymentModalOpen(false);
        setTransferId('');
        setPaymentMethod('CASH');

        if (enable_sii_integration && dteResult.shouldGenerate) {
            toast.success(`¡Venta Exitosa! Boleta Nº ${dteFolio} generada.`, { duration: 3000 });
        } else if (!enable_sii_integration) {
            toast.success('¡Venta Exitosa! Comprobante Interno Generado.', { duration: 3000 });
        } else {
            toast.success('¡Venta Exitosa! Fiscalizada por Voucher.', { duration: 3000 });
        }
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

    const openFractionModal = (e: React.MouseEvent, product: InventoryBatch) => {
        e.stopPropagation();
        setSelectedProductForFraction(product);
        setIsQuickFractionModalOpen(true);
    };

    const handleFractionConfirm = (quantity: number, price: number) => {
        if (selectedProductForFraction) {
            // Create a special fractional item
            const fractionalItem: any = {
                ...selectedProductForFraction,
                id: `${selectedProductForFraction.id}-F`, // Unique ID for fractional
                name: `🔵 ${selectedProductForFraction.name} (FRACCIONADO: ${quantity} un)`,
                price: selectedProductForFraction.fractional_price || Math.ceil(selectedProductForFraction.price / (selectedProductForFraction.units_per_box || 1)),
                quantity: quantity,
                is_fractional: true,
                original_name: selectedProductForFraction.name
            };
            // We add it as a manual item effectively, or modify addToCart to handle it.
            // Since addToCart takes InventoryBatch, we might need to use addManualItem or a custom logic.
            // Let's use addManualItem for now as it fits the "custom price/name" model, 
            // BUT we need to ensure inventory tracking. 
            // Ideally, we should update addToCart to support overrides, but for now let's construct a CartItem.

            // Hack: We use addToCart but we need to pass the modified object. 
            // However, addToCart looks up by ID usually. 
            // Let's use addManualItem which simply adds to cart array.
            addManualItem({
                sku: selectedProductForFraction.sku, // Keep SKU for tracking
                description: fractionalItem.name,
                price: fractionalItem.price,
                quantity: quantity,
                active_ingredients: selectedProductForFraction.active_ingredients,
                is_fractional: true,
                original_name: selectedProductForFraction.name
            });

            toast.success('Fraccionamiento agregado', { icon: <Scissors size={16} /> });
        }
    };

    return (
        <div className="flex h-[calc(100vh-80px)] bg-slate-100 overflow-hidden">

            {/* COL 1: Búsqueda (20%) */}
            <div className="w-[25%] flex flex-col p-6 pr-3 gap-4">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <div className="relative w-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-cyan-500 focus:outline-none transition-colors font-bold text-lg"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2 text-center">Escanee un producto para agregarlo rápido</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {searchTerm ? (
                            filteredInventory.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => addToCart(item, 1)}
                                    className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-cyan-200 cursor-pointer transition-all group"
                                >
                                    <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-cyan-600">
                                        {item.name}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-mono mb-1">{item.dci}</p>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-900">${item.price.toLocaleString()}</span>
                                        <div className="flex items-center gap-2">
                                            {item.is_fractionable && (
                                                <button
                                                    onClick={(e) => openFractionModal(e, item)}
                                                    className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                                    title="Venta Fraccionada"
                                                >
                                                    <Scissors size={16} />
                                                </button>
                                            )}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.stock_actual > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>Stock: {item.stock_actual}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
                                <Search size={48} className="mb-4" />
                                <p className="text-sm font-bold">Escriba para buscar</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* COL 2: Carrito y Pago (80%) */}
            <div className="flex-1 flex flex-col p-6 pl-0 gap-4">
                <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="bg-cyan-100 p-3 rounded-2xl text-cyan-700">
                                <ShoppingCart size={28} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-extrabold text-slate-800">Carrito de Compra</h1>
                                <p className="text-sm text-slate-500">{cart.length} ítems agregados</p>
                            </div>
                            {/* Shift Status Badge */}
                            <div className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${currentShift?.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                <div className={`w-2 h-2 rounded-full ${currentShift?.status === 'OPEN' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                {currentShift?.status === 'OPEN' ? `TURNO #${currentShift.shiftNumber} - ABIERTO` : 'CAJA CERRADA'}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setIsCashModalOpen(true)}
                                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-200"
                            >
                                <DollarSign size={20} />
                                <span className="hidden lg:inline">Gestión Caja</span>
                            </button>
                            <button
                                onClick={() => setIsManualItemModalOpen(true)}
                                className="flex items-center gap-2 bg-purple-100 text-purple-700 px-5 py-3 rounded-xl hover:bg-purple-200 font-bold transition-colors"
                            >
                                <Plus size={20} />
                                <span className="hidden lg:inline">Item Manual</span>
                            </button>
                            <button
                                onClick={clearCart}
                                className="flex items-center gap-2 bg-red-50 text-red-600 px-5 py-3 rounded-xl hover:bg-red-100 font-bold transition-colors"
                            >
                                <X size={20} />
                                <span className="hidden lg:inline">Limpiar</span>
                            </button>
                        </div>
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                <ShoppingCart size={80} className="mb-6 opacity-20" />
                                <h3 className="text-2xl font-bold text-slate-400">El carrito está vacío</h3>
                                <p className="text-slate-400">Escanee un producto o use el buscador</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                                    <tr>
                                        <th className="pb-3 pl-4">Producto (Seremi)</th>
                                        <th className="pb-3 text-center">Cant.</th>
                                        <th className="pb-3 text-right">Precio Unit.</th>
                                        <th className="pb-3 text-right">Total</th>
                                        <th className="pb-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {cart.map((item, idx) => {
                                        // Find full inventory item to get details for formatting
                                        const fullItem = inventory.find(i => i.id === item.id);
                                        const label = fullItem ? formatProductLabel(fullItem) : item.name;

                                        return (
                                            <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                                                <td className="py-4 pl-4">
                                                    <div className="flex flex-col">
                                                        <span className={`font-bold text-lg ${item.is_fractional ? 'text-blue-600' : 'text-slate-800'}`}>{item.name}</span>
                                                        <span className="text-xs text-slate-500 font-mono">{label}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-center">
                                                    <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg">
                                                        <button className="px-3 py-1 hover:bg-slate-100 text-slate-600 font-bold">-</button>
                                                        <span className="px-3 font-bold text-slate-800">{item.quantity}</span>
                                                        <button className="px-3 py-1 hover:bg-slate-100 text-slate-600 font-bold">+</button>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-right font-medium text-slate-600">
                                                    ${item.price.toLocaleString()}
                                                </td>
                                                <td className="py-4 text-right font-bold text-slate-900 text-xl">
                                                    ${(item.price * item.quantity).toLocaleString()}
                                                </td>
                                                <td className="py-4 text-right pr-4">
                                                    <button onClick={() => removeFromCart(item.sku)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                        <X size={20} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer / Total */}
                    <div className="bg-slate-900 text-white p-8 flex justify-between items-center">
                        <div className="flex gap-8">
                            <div>
                                <p className="text-slate-400 text-sm mb-1">Ítems</p>
                                <p className="text-2xl font-bold">{cart.reduce((acc, item) => acc + item.quantity, 0)}</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-sm mb-1">Subtotal</p>
                                <p className="text-2xl font-bold">${cartTotal.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="text-right">
                                <p className="text-slate-400 text-sm mb-1">Total a Pagar</p>
                                <p className="text-5xl font-extrabold text-emerald-400">${cartTotal.toLocaleString()}</p>
                            </div>
                            <button
                                onClick={handlePrePayment}
                                disabled={cart.length === 0 || !currentShift || currentShift.status === 'CLOSED'}
                                className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-12 py-6 rounded-2xl font-extrabold text-2xl shadow-lg shadow-emerald-900/50 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                PAGAR (F9)
                            </button>
                        </div>
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
            <CashControlModal
                isOpen={isCashModalOpen}
                onClose={() => setIsCashModalOpen(false)}
            />

            <CashOutModal
                isOpen={isCashOutModalOpen}
                onClose={() => setIsCashOutModalOpen(false)}
            />

            <QuickFractionModal
                isOpen={isQuickFractionModalOpen}
                onClose={() => setIsQuickFractionModalOpen(false)}
                product={selectedProductForFraction}
                onConfirm={handleFractionConfirm}
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
                                        placeholder="Ej: 12345678 (Opcional)"
                                        value={transferId}
                                        onChange={(e) => setTransferId(e.target.value)}
                                    />
                                    <p className="text-xs text-slate-400 mt-2 flex items-center">
                                        <AlertTriangle size={12} className="mr-1" />
                                        Puede ingresar el ID después en el historial si es necesario.
                                    </p>
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
                onConfirm={(rut) => {
                    // Logic to handle captured customer
                    setIsCustomerCaptureModalOpen(false);
                    proceedToPaymentFlow();
                }}
                onSkip={() => {
                    setIsCustomerCaptureModalOpen(false);
                    proceedToPaymentFlow();
                }}
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
