import React, { useState, useMemo, useEffect } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, X, Tag, CreditCard, Banknote, Smartphone, AlertTriangle, ShoppingCart, PlusCircle, Coins, DollarSign, Lock as LockIcon, Edit, TrendingDown, TrendingUp, Wallet, User, Bot, AlertOctagon, Snowflake, ScanBarcode, Scissors, Trash2, FileText, Printer, Minus, Star } from 'lucide-react';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import ClientPanel from './pos/ClientPanel';
import PrescriptionModal from './pos/PrescriptionModal';
import ManualItemModal from './pos/ManualItemModal';
import CashManagementModal from './pos/CashManagementModal'; // Updated import
import CashOutModal from './pos/CashOutModal';
import QuickFractionModal from './pos/QuickFractionModal';
import ShiftManagementModal from './pos/ShiftManagementModal';
import TransactionHistoryModal from './pos/TransactionHistoryModal';
import CameraScanner from './ui/CameraScanner';
import { CartItem, InventoryBatch } from '../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

import { useKioskGuard } from '../hooks/useKioskGuard';
import SafeExitButton from './security/SafeExitButton';
import { PrinterService } from '../../domain/services/PrinterService';
import CustomerSelectModal from './pos/CustomerSelectModal';
import { toast } from 'sonner';
import { shouldGenerateDTE } from '../../domain/logic/sii_dte';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { formatProductLabel } from '../../domain/logic/productDisplay';
import { useSettingsStore } from '@/presentation/store/useSettingsStore';
import { applyPromotions } from '../../domain/logic/promotionEngine';
import MobileActionScroll from './ui/MobileActionScroll';

const POSMainScreen: React.FC = () => {
    useKioskGuard(true); // Enable Kiosk Lock
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        processSale, currentCustomer, currentShift, getShiftMetrics, updateOpeningAmount, employees, printerConfig,
        setCustomer, promotions, redeemGiftCard, createQuote, retrieveQuote, updateCartItemQuantity,
        loyaltyConfig, calculateDiscountValue, redeemPoints
    } = usePharmaStore();

    const { enable_sii_integration } = useSettingsStore();

    const metrics = getShiftMetrics();
    const [isEditBaseModalOpen, setIsEditBaseModalOpen] = useState(false);
    const [supervisorPin, setSupervisorPin] = useState('');
    const [newBaseAmount, setNewBaseAmount] = useState('');
    const [editBaseError, setEditBaseError] = useState('');

    // Calculate promotions
    const { items: cartWithDiscounts, totalDiscount, finalTotal } = useMemo(() => {
        return applyPromotions(cart, currentCustomer, promotions);
    }, [cart, currentCustomer, promotions]);

    // Use finalTotal for display instead of raw reduce
    const total = finalTotal;

    const [searchTerm, setSearchTerm] = useState('');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
    const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
    const [isCustomerSelectModalOpen, setIsCustomerSelectModalOpen] = useState(false);
    const [isQuickFractionModalOpen, setIsQuickFractionModalOpen] = useState(false);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Modular Cash Management States
    const [cashModalMode, setCashModalMode] = useState<'AUDIT' | 'CLOSE' | 'MOVEMENT' | null>(null);

    // Mobile View State (Native Experience)
    const [mobileView, setMobileView] = useState<'CATALOG' | 'CART'>('CATALOG');

    // Quote Mode
    const [isQuoteMode, setIsQuoteMode] = useState(false);

    const handleScan = (decodedText: string) => {
        // Check for Quote
        if (decodedText.startsWith('COT-')) {
            const success = retrieveQuote(decodedText);
            if (success) {
                toast.success('Cotización cargada');
                setIsScannerOpen(false);
                return;
            }
        }

        // Search Product
        const product = inventory.find(p => p.sku === decodedText || p.barcode === decodedText);
        if (product) {
            addToCart(product, 1);
            toast.success(`Producto agregado: ${product.name}`);
            setIsScannerOpen(false);
        } else {
            toast.error('Producto no encontrado');
        }
    };

    // Gift Card Payment State
    const [giftCardCode, setGiftCardCode] = useState('');
    const [isGiftCardPayment, setIsGiftCardPayment] = useState(false);

    // Loyalty Points Redemption State
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    const [selectedProductForFraction, setSelectedProductForFraction] = useState<InventoryBatch | null>(null);
    const [pendingItemForPrescription, setPendingItemForPrescription] = useState<CartItem | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DEBIT' | 'TRANSFER'>('CASH');
    const [transferId, setTransferId] = useState('');

    // Sidebar Tabs State
    const [activeTab, setActiveTab] = useState<'CART' | 'CLIENT' | 'AI'>('CART');

    // Barcode Scanner Integration
    useBarcodeScanner({
        onScan: (code) => {
            // Check for Quote Barcode
            if (code.startsWith('COT-')) {
                retrieveQuote(code);
                return;
            }

            const product = inventory.find(p => p.sku === code || p.id === code || p.barcode === code);
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

    // Handle Search Submit (Enter key)
    const handleSearchSubmit = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (searchTerm.startsWith('COT-')) {
                retrieveQuote(searchTerm);
                setSearchTerm('');
                return;
            }
            // ... existing search logic if needed, currently it filters real-time
        }
    };

    // FEFO Sorting & Filtering - ONLY SHOW IF SEARCHING
    const filteredInventory = useMemo(() => {
        if (!searchTerm) return []; // Hide by default
        return inventory
            .filter(item =>
                (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.dci || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
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

        if (isQuoteMode) {
            const quote = createQuote(currentCustomer || undefined);
            // Print Quote Ticket
            // PrinterService.printQuote(quote, printerConfig); // TODO: Implement printQuote
            return;
        }

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

        // Redeem points if customer selected points
        if (currentCustomer && pointsToRedeem > 0) {
            const success = redeemPoints(currentCustomer.id, pointsToRedeem);
            if (!success) {
                // redeemPoints already shows error toast
                return;
            }
        }

        // Calculate final total with points discount
        const pointsDiscount = pointsToRedeem > 0 ? calculateDiscountValue(pointsToRedeem) : 0;
        const finalTotal = Math.max(0, cart.reduce((sum, item) => sum + item.price * item.quantity, 0) - pointsDiscount);

        // Capture sale data before processing (since cart clears)
        const saleToPrint: any = {
            id: `V-${Date.now()}`, // Mock ID, ideally returned by processSale
            timestamp: Date.now(),
            items: [...cart],
            total: finalTotal,
            payment_method: paymentMethod,
            customer: currentCustomer || undefined,
            transfer_id: paymentMethod === 'TRANSFER' ? (transferId || 'SIN_ID_PENDIENTE') : undefined,
            dte_status: dteResult.status,
            dte_folio: dteFolio,
            is_internal_ticket: !enable_sii_integration, // Flag for template
            points_redeemed: pointsToRedeem,
            points_discount: pointsDiscount
        };

        processSale(paymentMethod, currentCustomer || undefined);

        // Auto-Print Trigger
        PrinterService.printTicket(saleToPrint, printerConfig);

        setIsPaymentModalOpen(false);
        setTransferId('');
        setPaymentMethod('CASH');
        setPointsToRedeem(0);

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

    // Virtualization
    const parentRef = React.useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: filteredInventory.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 100, // Estimate card height
        overscan: 5,
    });

    // --- BLOCKED STATE RENDER ---
    if (!currentShift || currentShift.status === 'CLOSED') {
        return (
            <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                <div className="z-10 bg-white/10 backdrop-blur-lg p-8 md:p-12 rounded-3xl border border-white/20 shadow-2xl max-w-lg w-full text-center">
                    <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                        <LockIcon size={48} className="text-red-400" />
                    </div>

                    <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Terminal Bloqueado</h1>
                    <p className="text-slate-300 mb-8 text-lg">Se requiere apertura de caja para operar.</p>

                    <button
                        onClick={() => setIsShiftModalOpen(true)}
                        className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-xl text-xl shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105"
                    >
                        Solicitar Apertura a Gerente
                    </button>

                    <div className="mt-8 pt-6 border-t border-white/10">
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Farmacias Vallenar Suit v2.1</p>
                    </div>
                </div>

                <ShiftManagementModal
                    isOpen={isShiftModalOpen}
                    onClose={() => setIsShiftModalOpen(false)}
                />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-80px)] bg-slate-100 overflow-hidden">

            {/* COL 1: Búsqueda (Fixed 350px Desktop, 100% Mobile Catalog View) */}
            <div className={`w-full md:w-[350px] flex-col p-4 md:p-6 md:pr-3 gap-4 h-full ${mobileView === 'CART' ? 'hidden md:flex' : 'flex'}`}>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="p-4 md:p-6 border-b border-slate-100">
                        <div className="relative flex items-center"> {/* Added flex items-center here */}
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={24} />
                                <input
                                    type="text"
                                    placeholder="Buscar o Escanear (COT-...)"
                                    className="w-full pl-12 pr-12 py-4 bg-white rounded-2xl border-2 border-slate-100 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 outline-none transition-all text-lg font-medium shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (searchTerm.startsWith('COT-')) {
                                                retrieveQuote(searchTerm);
                                                setSearchTerm('');
                                            } else {
                                                // Existing search logic handled by filteredInventory/manual selection
                                                // For direct barcode entry:
                                                const exactMatch = inventory.find(i => i.sku === searchTerm || i.barcode === searchTerm);
                                                if (exactMatch) {
                                                    addToCart(exactMatch, 1);
                                                    setSearchTerm('');
                                                    toast.success('Producto agregado');
                                                }
                                            }
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => setIsScannerOpen(true)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 md:hidden p-2 text-slate-400 hover:text-cyan-600"
                                >
                                    <ScanBarcode size={24} />
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 text-center hidden md:block">Escanee producto o cotización</p>
                    </div>

                    <div
                        ref={parentRef}
                        className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4"
                    >
                        {searchTerm ? (
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
                                    const item = filteredInventory[virtualItem.index];
                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualItem.size}px`,
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                            className="pb-3" // Spacing between items
                                        >
                                            <div
                                                onClick={() => addToCart(item, 1)}
                                                className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-cyan-200 cursor-pointer transition-all group h-full"
                                            >
                                                <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-cyan-600">
                                                    {item.name}
                                                </h3>
                                                <p className="text-[10px] text-slate-500 font-mono mb-1">{item.dci}</p>
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-slate-900">${(item.price || 0).toLocaleString()}</span>
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
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
                                <Search size={48} className="mb-4" />
                                <p className="text-sm font-bold">Escriba para buscar</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile Floating Cart Button (FAB) - Only in CATALOG view */}
            {mobileView === 'CATALOG' && cart.length > 0 && (
                <div className="fixed bottom-20 left-4 right-4 md:hidden z-40">
                    <button
                        onClick={() => setMobileView('CART')}
                        className="w-full bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center font-bold animate-in slide-in-from-bottom-5"
                    >
                        <div className="flex items-center gap-2">
                            <ShoppingCart size={20} />
                            <span>Ver Carrito ({cart.reduce((acc, item) => acc + item.quantity, 0)})</span>
                        </div>
                        <span className="text-xl">${cartTotal.toLocaleString()}</span>
                    </button>
                </div>
            )}

            {/* COL 2: Carrito y Pago (75% Desktop, 100% Mobile Cart View) */}
            <div className={`
                fixed inset-0 z-50 bg-slate-100 md:static md:bg-transparent md:z-auto
                flex-1 flex-col p-4 md:p-6 md:pl-0 gap-4
                ${mobileView === 'CART' ? 'flex' : 'hidden md:flex'}
            `}>
                <div className={`flex-1 rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full transition-colors ${isQuoteMode ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                    {/* Header */}
                    <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            {/* Mobile Back Button */}
                            <button
                                onClick={() => setMobileView('CATALOG')}
                                className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-full mr-2"
                            >
                                <TrendingDown className="rotate-90" size={24} />
                            </button>

                            <div className={`p-2 md:p-3 rounded-2xl hidden md:block ${isQuoteMode ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                {isQuoteMode ? <FileText size={28} /> : <ShoppingCart size={28} />}
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                                    {isQuoteMode ? 'Cotización' : 'Carrito'}
                                    {isQuoteMode && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded-full">MODO COTIZACIÓN</span>}
                                </h1>
                                <div className="flex items-center gap-2 mt-1">
                                    {currentCustomer ? (
                                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100">
                                            <User size={14} />
                                            <span className="text-xs font-bold">{currentCustomer.fullName}</span>
                                            <button
                                                onClick={() => setCustomer(null)}
                                                className="p-0.5 hover:bg-emerald-200 rounded-full"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400 font-bold hidden md:inline">👤 Cliente: Anónimo</span>
                                            <button
                                                onClick={() => setIsCustomerSelectModalOpen(true)}
                                                className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md hover:bg-slate-200 transition"
                                            >
                                                + CLIENTE
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Shift Status Badge - Compact on Mobile */}
                            <div className={`px-2 md:px-4 py-1 md:py-2 rounded-lg font-bold text-[10px] md:text-sm flex items-center gap-2 ${currentShift?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                <div className={`w-2 h-2 rounded-full ${currentShift?.status === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                <span className="hidden md:inline">{currentShift?.status === 'ACTIVE' ? `TURNO #${currentShift.id.slice(-6)} - ABIERTO` : 'CAJA CERRADA'}</span>
                                <span className="md:hidden">{currentShift?.status === 'ACTIVE' ? `#${currentShift.id.slice(-6)}` : 'CERRADO'}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 md:gap-3 overflow-hidden w-full md:w-auto">
                            <MobileActionScroll className="w-full md:w-auto justify-end">
                                {currentShift?.status === 'ACTIVE' ? (
                                    <>
                                        <button
                                            onClick={() => setCashModalMode('MOVEMENT')}
                                            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-blue-100 font-bold transition-colors whitespace-nowrap"
                                        >
                                            <TrendingDown size={20} />
                                            <span className="hidden lg:inline">Ingreso/Gasto</span>
                                        </button>
                                        <button
                                            onClick={() => setCashModalMode('AUDIT')}
                                            className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-purple-100 font-bold transition-colors whitespace-nowrap"
                                        >
                                            <LockIcon size={20} />
                                            <span className="hidden lg:inline">Arqueo</span>
                                        </button>
                                        <button
                                            onClick={() => setCashModalMode('CLOSE')}
                                            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-slate-700 font-bold transition-colors whitespace-nowrap"
                                        >
                                            <LockIcon size={20} />
                                            <span className="hidden lg:inline">Cerrar Turno</span>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setIsShiftModalOpen(true)}
                                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-green-700 font-bold transition-colors whitespace-nowrap animate-pulse"
                                    >
                                        <LockIcon size={20} />
                                        <span className="hidden lg:inline">Abrir Turno</span>
                                    </button>
                                )}

                                <div className="w-px h-8 bg-slate-200 mx-2 hidden md:block"></div>

                                <button
                                    onClick={() => setIsHistoryModalOpen(true)}
                                    className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-slate-200 font-bold transition-colors whitespace-nowrap"
                                >
                                    <FileText size={20} />
                                    <span className="hidden lg:inline">Historial</span>
                                </button>
                                <button
                                    onClick={() => setIsQuoteMode(!isQuoteMode)}
                                    className={`flex items-center gap-2 px-4 py-2 md:px-5 md:py-3 rounded-full font-bold transition-colors whitespace-nowrap ${isQuoteMode ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    <FileText size={20} />
                                    <span className="hidden lg:inline">{isQuoteMode ? 'Salir Cotiz.' : 'Cotizar'}</span>
                                </button>
                                <button
                                    onClick={() => setIsManualItemModalOpen(true)}
                                    className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-purple-200 font-bold transition-colors whitespace-nowrap"
                                >
                                    <Plus size={20} />
                                    <span className="hidden lg:inline">Manual</span>
                                </button>
                                <button
                                    onClick={clearCart}
                                    className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-red-100 font-bold transition-colors whitespace-nowrap"
                                >
                                    <X size={20} />
                                    <span className="hidden lg:inline">Limpiar</span>
                                </button>
                            </MobileActionScroll>
                        </div>
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                <ShoppingCart size={80} className="mb-6 opacity-20" />
                                <h3 className="text-2xl font-bold text-slate-400">El carrito está vacío</h3>
                                <p className="text-slate-400">Escanee un producto o use el buscador</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Desktop Table View (Hidden on Mobile) */}
                                <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                                                <th className="p-4 font-bold w-[50%]">Producto</th>
                                                <th className="p-4 font-bold w-[15%] text-center">Cant.</th>
                                                <th className="p-4 font-bold w-[15%] text-right">Precio</th>
                                                <th className="p-4 font-bold w-[20%] text-right">Total</th>
                                                <th className="p-4 font-bold text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {cartWithDiscounts.map((item) => {
                                                const fullItem = inventory.find(i => i.id === item.id);
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="p-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-800 text-lg leading-tight">
                                                                    {fullItem ? formatProductLabel(fullItem) : item.name}
                                                                </span>
                                                                {item.discount && (
                                                                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full w-fit mt-1 flex items-center gap-1">
                                                                        <Tag size={12} /> OFERTA
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-1 w-fit mx-auto">
                                                                <button
                                                                    onClick={() => updateCartItemQuantity(item.sku, item.quantity - 1)}
                                                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 disabled:opacity-50 border border-slate-200"
                                                                    disabled={item.quantity <= 1}
                                                                >
                                                                    <Minus size={16} />
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    value={item.quantity}
                                                                    onChange={(e) => updateCartItemQuantity(item.sku, parseInt(e.target.value) || 1)}
                                                                    className="w-16 h-8 text-center bg-white font-bold text-lg border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none p-0"
                                                                />
                                                                <button
                                                                    onClick={() => updateCartItemQuantity(item.sku, item.quantity + 1)}
                                                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-200"
                                                                >
                                                                    <Plus size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <span className="text-xl font-bold text-slate-600">
                                                                ${(item.price || 0).toLocaleString()}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            {item.discount ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="font-bold text-slate-800 text-2xl">
                                                                        ${(item.discount.finalPrice * item.quantity).toLocaleString()}
                                                                    </span>
                                                                    <span className="text-sm text-slate-400 line-through">
                                                                        ${((item.price || 0) * item.quantity).toLocaleString()}
                                                                    </span>
                                                                    <span className="text-green-600 font-bold text-xs">
                                                                        (-${(item.discount.discountAmount * item.quantity).toLocaleString()})
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="font-bold text-slate-800 text-2xl">
                                                                    ${((item.price || 0) * item.quantity).toLocaleString()}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <button
                                                                onClick={() => removeFromCart(item.sku)}
                                                                className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 size={24} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile List View (Hidden on Desktop) */}
                                <div className="md:hidden space-y-3">
                                    {cartWithDiscounts.map((item) => {
                                        const fullItem = inventory.find(i => i.id === item.id);
                                        return (
                                            <div key={item.id} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-bold text-slate-800 text-base">{fullItem ? formatProductLabel(fullItem) : item.name}</h3>
                                                        {item.discount && (
                                                            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                <Tag size={10} /> OFERTA
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                                        <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200">
                                                            <button
                                                                onClick={() => updateCartItemQuantity(item.sku, item.quantity - 1)}
                                                                className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600 disabled:opacity-50"
                                                                disabled={item.quantity <= 1}
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                value={item.quantity}
                                                                onChange={(e) => updateCartItemQuantity(item.sku, parseInt(e.target.value) || 1)}
                                                                className="w-10 text-center bg-transparent font-mono font-bold text-slate-800 outline-none text-sm appearance-none m-0"
                                                            />
                                                            <button
                                                                onClick={() => updateCartItemQuantity(item.sku, item.quantity + 1)}
                                                                className="p-1 hover:bg-slate-200 rounded-r-lg text-slate-600"
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        </div>
                                                        <span>x</span>
                                                        <span className="text-lg font-bold text-slate-700">${(item.price || 0).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right mr-4">
                                                    <p className="font-bold text-slate-800 text-xl">${((item.discount?.finalPrice || item.price || 0) * item.quantity).toLocaleString()}</p>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.sku)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer / Total */}
                    <div className="bg-slate-900 text-white p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex gap-8 w-full md:w-auto justify-between md:justify-start">
                            <div>
                                <p className="text-slate-400 text-sm mb-1">Ítems</p>
                                <p className="text-2xl font-bold">{cart.reduce((acc, item) => acc + item.quantity, 0)}</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-sm mb-1">Subtotal</p>
                                <p className="text-2xl font-bold">${cartTotal.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full md:w-auto">
                            <div className="text-right w-full md:w-auto flex justify-between md:block items-center">
                                <p className="text-slate-400 text-sm mb-1">Total a Pagar</p>
                                <p className="text-4xl md:text-6xl font-extrabold text-emerald-400">${cartTotal.toLocaleString()}</p>
                            </div>
                            <button
                                onClick={handlePrePayment}
                                disabled={cart.length === 0 || !currentShift || currentShift.status !== 'ACTIVE'}
                                className={`w-full md:w-auto px-8 md:px-12 py-4 md:py-6 rounded-2xl font-extrabold text-xl md:text-2xl shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${isQuoteMode ? 'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow-amber-900/50' : 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-900/50'}`}
                            >
                                {isQuoteMode ? 'GUARDAR (F9)' : 'PAGAR (F9)'}
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

            {/* Modular Cash Management Modal */}
            {cashModalMode && (
                <CashManagementModal // Note: Ensure this is imported correctly as CashManagementModal, not CashControlModal
                    isOpen={!!cashModalMode}
                    onClose={() => setCashModalMode(null)}
                    mode={cashModalMode}
                />
            )}

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

                            {/* Loyalty Points Redemption */}
                            {currentCustomer && currentCustomer.totalPoints > 0 && (
                                <div className="mb-6 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 bg-amber-100 rounded-lg">
                                                <Star size={20} className="text-amber-600" fill="currentColor" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-amber-900">Puntos Disponibles</p>
                                                <p className="text-2xl font-extrabold text-amber-700">{currentCustomer.totalPoints.toLocaleString()} pts</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-amber-600 font-semibold">Valor</p>
                                            <p className="text-xl font-bold text-amber-700">${calculateDiscountValue(currentCustomer.totalPoints).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {currentCustomer.totalPoints >= loyaltyConfig.min_points_to_redeem && (
                                        <>
                                            <div className="border-t border-amber-200 my-3 pt-3">
                                                <label className="block text-sm font-bold text-amber-900 mb-2">Puntos a Canjear</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={currentCustomer.totalPoints}
                                                        step={loyaltyConfig.min_points_to_redeem}
                                                        className="flex-1 p-3 border-2 border-amber-300 rounded-xl focus:border-amber-500 focus:outline-none font-bold text-lg bg-white"
                                                        placeholder={`Mín: ${loyaltyConfig.min_points_to_redeem}`}
                                                        value={pointsToRedeem || ''}
                                                        onChange={(e) => {
                                                            const value = parseInt(e.target.value) || 0;
                                                            setPointsToRedeem(Math.min(value, currentCustomer.totalPoints));
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => setPointsToRedeem(currentCustomer.totalPoints)}
                                                        className="px-4 py-2 bg-amber-200 text-amber-900 font-bold rounded-xl hover:bg-amber-300 transition whitespace-nowrap"
                                                    >
                                                        Usar Todos
                                                    </button>
                                                </div>
                                            </div>
                                            {pointsToRedeem > 0 && (
                                                <div className="mt-3 p-3 bg-amber-100 rounded-xl border border-amber-300">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-bold text-amber-900">Descuento Aplicado:</span>
                                                        <span className="text-2xl font-extrabold text-emerald-600">- ${calculateDiscountValue(pointsToRedeem).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-xs text-amber-600 mt-1">Puntos restantes: {(currentCustomer.totalPoints - pointsToRedeem).toLocaleString()}</p>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {currentCustomer.totalPoints < loyaltyConfig.min_points_to_redeem && (
                                        <div className="mt-3 p-2 bg-amber-100 rounded-lg border border-amber-300 text-center">
                                            <p className="text-xs text-amber-700 font-semibold">
                                                Se requieren {loyaltyConfig.min_points_to_redeem} puntos mínimo para canjear
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Total with Points Discount */}
                            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border-2 border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-slate-600 font-semibold">Subtotal:</span>
                                    <span className="text-xl font-bold text-slate-800">${cartTotal.toLocaleString()}</span>
                                </div>
                                {pointsToRedeem > 0 && (
                                    <div className="flex justify-between items-center mb-2 text-emerald-600">
                                        <span className="font-semibold flex items-center gap-1">
                                            <Star size={16} fill="currentColor" />
                                            Descuento por Puntos:
                                        </span>
                                        <span className="text-xl font-bold">- ${calculateDiscountValue(pointsToRedeem).toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="border-t-2 border-slate-300 mt-2 pt-2 flex justify-between items-center">
                                    <span className="text-slate-900 font-extrabold text-lg">TOTAL:</span>
                                    <span className="text-3xl font-extrabold text-cyan-600">
                                        ${Math.max(0, cartTotal - calculateDiscountValue(pointsToRedeem)).toLocaleString()}
                                    </span>
                                </div>
                            </div>

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
            {isScannerOpen && (
                <CameraScanner
                    onScan={handleScan}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}

            <TransactionHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
            />

            <CustomerSelectModal
                isOpen={isCustomerSelectModalOpen}
                onClose={() => setIsCustomerSelectModalOpen(false)}
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
