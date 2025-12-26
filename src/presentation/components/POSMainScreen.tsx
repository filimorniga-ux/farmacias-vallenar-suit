import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { usePOSKeyboard } from '../../hooks/usePOSKeyboard'; // Hook "God Mode"
import { usePharmaStore } from '../store/useStore';
import {
    Search, Plus, X, Tag, ShoppingCart, Lock,
    RefreshCw, ScanBarcode,
    Scissors, TrendingDown, FileText, User, Minus, Trash2, CornerDownLeft
} from 'lucide-react';
import { MobileScanner } from '../../components/shared/MobileScanner';
import { scanProductSecure } from '../../actions/scan-v2';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import ClientPanel from './pos/ClientPanel';
import PrescriptionModal from './pos/PrescriptionModal';
import ManualItemModal from './pos/ManualItemModal';
import CashManagementModal from './pos/CashManagementModal'; // Updated import
import CashOutModal from './pos/CashOutModal';
import QuickFractionModal from './pos/QuickFractionModal';
import ShiftManagementModal from './pos/ShiftManagementModal';
import { ShiftHandoverModal } from './pos/ShiftHandoverModal'; // New Import
import TransactionHistoryModal from './pos/TransactionHistoryModal';
import QueueWidget from './pos/QueueWidget';
import CameraScanner from './ui/CameraScanner';
import { CartItem, InventoryBatch } from '../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

import { useKioskGuard } from '../hooks/useKioskGuard';
import SafeExitButton from './security/SafeExitButton';
// printSaleTicket moved to useCheckout hook
import { useLocationStore } from '../store/useLocationStore';
import CustomerSelectModal from './pos/CustomerSelectModal';
import { toast } from 'sonner';
// shouldGenerateDTE moved to useCheckout hook
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { formatProductLabel } from '../../domain/logic/productDisplay';
// useSettingsStore moved to useCheckout hook
import { applyPromotions } from '../../domain/logic/promotionEngine';
import MobileActionScroll from './ui/MobileActionScroll';

// NEW MODULAR IMPORTS
import { PaymentModal } from './pos/Payment';
import { Cart } from './pos/Cart';
import { validateSupervisorPin } from '../../actions/auth-v2';

const POSMainScreen: React.FC = () => {
    useKioskGuard(true); // Enable Kiosk Lock
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        currentCustomer, currentShift, getShiftMetrics, updateOpeningAmount,
        setCustomer, promotions, createQuote, retrieveQuote, updateCartItemQuantity
        // NOTE: processSale, redeemPoints, calculateDiscountValue, loyaltyConfig, employees, printerConfig
        // are now accessed via useCheckout hook in PaymentModal
    } = usePharmaStore();

    const { currentLocation } = useLocationStore();

    // NOTE: enable_sii_integration, hardware now accessed via useCheckout hook in PaymentModal

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
    const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false); // New State
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Modular Cash Management States
    const [cashModalMode, setCashModalMode] = useState<'AUDIT' | 'CLOSE' | 'MOVEMENT' | null>(null);

    // Mobile View State (Native Experience)
    const [mobileView, setMobileView] = useState<'CATALOG' | 'CART'>('CATALOG');

    // Quote Mode
    const [isQuoteMode, setIsQuoteMode] = useState(false);

    // NOTE: isCheckoutProcessing, autoPrint, paymentMethod, transferId, pointsToRedeem
    // are now managed internally by PaymentModal via useCheckout hook

    // Helper for FEFO Selection
    const findBestBatch = (code: string) => {
        // Find all matches
        const matches = inventory.filter(p => p.sku === code || p.id === code || p.barcode === code);
        if (matches.length === 0) return undefined;

        // Sort by Expiry Date (Ascending) -> First Expiring First
        // Filter out 0 stock if possible, but if all are 0, return one.
        // Usually we want to sell available stock.
        const availableMatches = matches.filter(m => m.stock_actual > 0);

        const candidatePool = availableMatches.length > 0 ? availableMatches : matches;

        return candidatePool.sort((a, b) => a.expiry_date - b.expiry_date)[0];
    };

    const handleScan = async (decodedText: string) => {
        // 1. Check for Quote
        if (decodedText.startsWith('COT-')) {
            const success = await retrieveQuote(decodedText);
            if (success) {
                toast.success('Cotización cargada');
                setIsScannerOpen(false);
                return;
            }
        }

        // 2. Server-Side Optimized Scan (Faster than finding in 5k items locally?) 
        // User requested DB Index usage.
        if (navigator.vibrate) navigator.vibrate(200);

        const result = await scanProductSecure(decodedText, currentLocation?.id || '');

        if (result.success && result.data) {
            // 3. Find full object in local memory to ensure we have all POS Required fields (prices, tax, etc)
            // We use the ID returned by the fast scanner to find exact match.
            const product = inventory.find(i => i.id === result.data?.id);

            if (product) {
                addToCart(product, 1);
                toast.success(`Producto agregado: ${product.name} `);
                const audio = new Audio('/beep.mp3');
                audio.play().catch(() => { });
                // Don't close if continuous, allows rapid scanning.
                // User asked for continuous. But MobileScanner component handles it via prop.
                // Here we just handle the add.
            } else {
                toast.error('Producto en DB pero no sincronizado localmente. Sincronice.');
            }
        } else {
            toast.error('Producto no encontrado');
        }
    };

    // Gift Card Payment State (legacy - to be moved to hook)
    const [giftCardCode, setGiftCardCode] = useState('');
    const [isGiftCardPayment, setIsGiftCardPayment] = useState(false);

    // Fraction and Prescription State
    const [selectedProductForFraction, setSelectedProductForFraction] = useState<InventoryBatch | null>(null);
    const [pendingItemForPrescription, setPendingItemForPrescription] = useState<CartItem | null>(null);

    // NOTE: paymentMethod, transferId, pointsToRedeem, autoPrint now managed by useCheckout hook via PaymentModal

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

            const product = findBestBatch(code);
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

    // --- GOD MODE OPTIMIZATIONS ---

    // 1. Pre-sort Inventory (FEFO) - Only resorts when inventory changes
    const sortedInventory = useMemo(() => {
        return [...inventory].sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0));
    }, [inventory]);

    // 2. High-Speed Filter
    const filteredInventory = useMemo(() => {
        if (!searchTerm) return [];
        const lowerTerm = searchTerm.toLowerCase();

        return sortedInventory.filter(item =>
            (item.name || '').toLowerCase().includes(lowerTerm) ||
            (item.sku || '').toLowerCase().includes(lowerTerm) ||
            (item.dci || '').toLowerCase().includes(lowerTerm)
        );
    }, [sortedInventory, searchTerm]);

    // 3. Keyboard Hook Integration
    const searchInputRef = useRef<HTMLInputElement>(null);
    const parentRef = React.useRef<HTMLDivElement>(null); // ensure ref is matched

    const { selectedIndex } = usePOSKeyboard({
        resultsLength: filteredInventory.length,
        onFocusSearch: () => searchInputRef.current?.focus(),
        onEscape: () => setSearchTerm('')
    });

    const rowVirtualizer = useVirtualizer({
        count: filteredInventory.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 100, // Estimate card height
        overscan: 5,
    });

    // 4. Sync Scroll with Keyboard Selection
    useEffect(() => {
        if (filteredInventory.length > 0 && rowVirtualizer) {
            try {
                rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
            } catch (e) { console.warn('Scroll sync warned', e); }
        }
    }, [selectedIndex, filteredInventory, rowVirtualizer]);

    // 5. Intelligent Enter Handling
    const handleKeyDownInput = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default form submission or newline

            // Case A: Quote or Command
            if (searchTerm.startsWith('COT-')) {
                retrieveQuote(searchTerm);
                setSearchTerm('');
                return;
            }

            // Case B: List Selection (Keyboard Navigation)
            if (filteredInventory.length > 0) {
                const selectedItem = filteredInventory[selectedIndex];
                if (selectedItem) {
                    addToCart(selectedItem, 1);
                    setSearchTerm('');
                    toast.success(selectedItem.name, { position: 'bottom-left' });
                }
            }
        }
    };


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

    // NOTE: handleCheckout logic moved to useCheckout hook in PaymentModal

    // SECURITY FIX: Server-side PIN validation for base update
    const handleUpdateBase = async () => {
        if (!supervisorPin || !newBaseAmount) {
            setEditBaseError('Complete todos los campos');
            return;
        }

        try {
            const result = await validateSupervisorPin(supervisorPin, 'UPDATE_BASE_AMOUNT');
            if (result.success) {
                updateOpeningAmount(Number(newBaseAmount));
                setIsEditBaseModalOpen(false);
                setSupervisorPin('');
                setNewBaseAmount('');
                setEditBaseError('');
                toast.success('Base actualizada correctamente');
            } else {
                setEditBaseError(result.error || 'PIN no autorizado');
            }
        } catch (error) {
            console.error('Error validating supervisor PIN:', error);
            setEditBaseError('Error de validación');
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
                id: `${selectedProductForFraction.id} -F`, // Unique ID for fractional
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



    // --- BLOCKED STATE RENDER ---
    if (!currentShift || currentShift.status === 'CLOSED') {
        return (
            <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                <div className="z-10 bg-white/10 backdrop-blur-lg p-8 md:p-12 rounded-3xl border border-white/20 shadow-2xl max-w-lg w-full text-center">
                    <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                        <Lock size={48} className="text-red-400" />
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
            <div className={`w - full md: w - [350px] flex - col p - 4 md: p - 6 md: pr - 3 gap - 4 h - full ${mobileView === 'CART' ? 'hidden md:flex' : 'flex'} `}>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="p-4 md:p-6 border-b border-slate-100">
                        <div className="relative flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={24} />
                                <input
                                    type="text"
                                    ref={searchInputRef}
                                    placeholder="Buscar o Escanear (COT-...)"
                                    className="w-full pl-12 pr-12 py-4 bg-white rounded-2xl border-2 border-slate-100 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 outline-none transition-all text-lg font-medium shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={handleKeyDownInput} // Use Smart Handler
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
                                    height: `${rowVirtualizer.getTotalSize()} px`,
                                    width: '100%',
                                    position: 'relative',
                                    contain: 'strict'
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                                    // Virtualizer Row Rendering
                                    const item = filteredInventory[virtualRow.index];
                                    const isSelected = virtualRow.index === selectedIndex;

                                    return (
                                        <div
                                            key={virtualRow.key}
                                            data-index={virtualRow.index}
                                            ref={rowVirtualizer.measureElement}
                                            className={`absolute top-0 left-0 w-full p-2 transition-all duration-75 ${isSelected
                                                ? 'bg-amber-50 border-l-4 border-amber-500 shadow-sm z-10 scale-[1.01]'
                                                : 'hover:bg-slate-50 border-l-4 border-transparent'
                                                }`}
                                            style={{
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                            onClick={() => {
                                                addToCart(item, 1);
                                                setSearchTerm('');
                                            }}
                                        >
                                            <div
                                                className={`p-3 rounded-xl border transition-all group h-full cursor-pointer relative ${isSelected
                                                    ? 'bg-cyan-50 border-cyan-500 shadow-md ring-2 ring-cyan-200 z-10 scale-[1.02]'
                                                    : 'bg-white border-slate-100 hover:border-cyan-200'
                                                    }`}
                                            >
                                                <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-cyan-600">
                                                    {item.name}
                                                </h3>
                                                <p className="text-[10px] text-slate-500 font-mono mb-1">{item.dci}</p>
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-slate-900">${(item.price || 0).toLocaleString()}</span>
                                                    <div className="flex items-center gap-2">
                                                        {virtualRow.index === selectedIndex && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 animate-pulse bg-cyan-100 px-2 py-0.5 rounded-full">
                                                                <CornerDownLeft size={12} /> ENTER
                                                            </span>
                                                        )}
                                                        {item.is_fractionable && (
                                                            <button
                                                                onClick={(e) => openFractionModal(e, item)}
                                                                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                                                title="Venta Fraccionada"
                                                            >
                                                                <Scissors size={16} />
                                                            </button>
                                                        )}
                                                        <span className={`text - [10px] px - 1.5 py - 0.5 rounded ${item.stock_actual > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} `}>Stock: {item.stock_actual}</span>
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

            {/* COL 2: Carrito y Pago (Always visible on Desktop, Toggled on Mobile) */}
            <div className={`
                fixed inset - 0 z - 50 bg - slate - 100
md:static md: bg - transparent md: z - auto md:flex md: flex - 1
flex - col p - 4 md: p - 6 md: pl - 0 gap - 4
                ${mobileView === 'CART' ? 'flex' : 'hidden'}
`}>
                {/* Queue Widget (Only Desktop or if explicitly shown, for now Show Always in Col 2) */}
                <QueueWidget />

                <div className={`flex - 1 rounded - 3xl shadow - xl border border - slate - 200 overflow - hidden flex flex - col h - full transition - colors ${isQuoteMode ? 'bg-amber-50 border-amber-200' : 'bg-white'} `}>
                    {/* Header */}
                    <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:justify-between md:items-center bg-slate-50/50 gap-4">
                        <div className="flex items-center gap-4 justify-between md:justify-start w-full md:w-auto">
                            <div className="flex items-center gap-4">
                                {/* Mobile Back Button */}
                                <button
                                    onClick={() => setMobileView('CATALOG')}
                                    className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-full mr-2"
                                >
                                    <TrendingDown className="rotate-90" size={24} />
                                </button>

                                <div className={`p - 2 md: p - 3 rounded - 2xl hidden md:block ${isQuoteMode ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'} `}>
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
                            </div>

                            {/* Shift Status Badge - Compact on Mobile - Moved to right on mobile flex row if possible, or just stay */}
                            <div className={`px - 2 md: px - 4 py - 1 md: py - 2 rounded - lg font - bold text - [10px] md: text - sm flex items - center gap - 2 flex - shrink - 0 ${currentShift?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} `}>
                                <div className={`w - 2 h - 2 rounded - full ${currentShift?.status === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'} `} />
                                <span className="hidden md:inline">{currentShift?.status === 'ACTIVE' ? `TURNO #${currentShift.id.slice(-6)} - ABIERTO` : 'CAJA CERRADA'}</span>
                                <span className="md:hidden">{currentShift?.status === 'ACTIVE' ? `#${currentShift.id.slice(-6)} ` : 'CERRADO'}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 md:gap-3 overflow-hidden w-full md:w-auto">
                            <MobileActionScroll className="w-full md:w-auto justify-end">
                                {currentShift?.status === 'ACTIVE' ? (
                                    <>
                                        <button
                                            onClick={() => setIsHandoverModalOpen(true)}
                                            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-slate-800 border border-slate-700 font-bold transition-colors whitespace-nowrap shadow-lg shadow-black/10"
                                        >
                                            <RefreshCw size={20} />
                                            <span className="hidden lg:inline">Cambio Turno</span>
                                        </button>
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
                                            <Lock size={20} />
                                            <span className="hidden lg:inline">Arqueo</span>
                                        </button>
                                        <button
                                            onClick={() => setCashModalMode('CLOSE')}
                                            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-slate-700 font-bold transition-colors whitespace-nowrap"
                                        >
                                            <Lock size={20} />
                                            <span className="hidden lg:inline">Cerrar Turno</span>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setIsShiftModalOpen(true)}
                                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 md:px-5 md:py-3 rounded-full hover:bg-green-700 font-bold transition-colors whitespace-nowrap animate-pulse"
                                    >
                                        <Lock size={20} />
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
                                    className={`flex items - center gap - 2 px - 4 py - 2 md: px - 5 md: py - 3 rounded - full font - bold transition - colors whitespace - nowrap ${isQuoteMode ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} `}
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
                                className={`w - full md: w - auto px - 8 md: px - 12 py - 4 md: py - 6 rounded - 2xl font - extrabold text - xl md: text - 2xl shadow - lg transition - all transform hover: scale - 105 disabled: opacity - 50 disabled: cursor - not - allowed disabled: transform - none ${isQuoteMode ? 'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow-amber-900/50' : 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-900/50'} `}
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

            {/* Payment Modal - Now using modular component */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onSuccess={() => {
                    // Optional: track successful sales for analytics
                    console.log('[POS] Sale completed successfully');
                }}
            />
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

            <ShiftHandoverModal
                isOpen={isHandoverModalOpen}
                onClose={() => setIsHandoverModalOpen(false)}
            />

            <CustomerSelectModal
                isOpen={isCustomerSelectModalOpen}
                onClose={() => setIsCustomerSelectModalOpen(false)}
            />



            {/* Mobile Scanner Overlay */}
            {isScannerOpen && (
                <MobileScanner
                    onScan={handleScan}
                    onClose={() => setIsScannerOpen(false)}
                    continuous={true} // Allow multiple scans
                />
            )}

            {/* FAB for Mobile Scan */}
            <div className="md:hidden fixed bottom-24 right-4 z-40">
                <button
                    onClick={() => setIsScannerOpen(true)}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-lg shadow-black/20"
                >
                    <ScanBarcode size={28} />
                </button>
            </div>

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
