import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { usePOSKeyboard } from '../../hooks/usePOSKeyboard'; // Hook "God Mode"
import { createQuoteSecure } from '../../actions/quotes-v2';
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
import { ShiftHistoryModal } from './pos/ShiftHistoryModal'; // New Import
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
import { buildPOSCatalog, filterInventoryForPOS, selectRetailLotCandidate, sortInventoryForPOS } from '../../domain/logic/posSearch';
// useSettingsStore moved to useCheckout hook
// useSettingsStore moved to useCheckout hook
import { applyPromotions } from '../../domain/logic/promotionEngine';
import { useInventoryQuery } from '../hooks/useInventoryQuery';


// NEW MODULAR IMPORTS
import { PaymentModal } from './pos/Payment';
import { Cart } from './pos/Cart';

import { validateSupervisorPin } from '../../actions/auth-v2';
import { POSHeaderActions } from './pos/POSHeaderActions';
import QuoteHistoryModal from './quotes/QuoteHistoryModal';
import { ExpressAddProductModal } from './pos/ExpressAddProductModal';

// Helper: Formatear número con separadores de miles (puntos)
const formatWithThousands = (value: string | number): string => {
    const numericValue = typeof value === 'string'
        ? value.replace(/\./g, '').replace(/[^0-9]/g, '')
        : String(value);
    if (!numericValue) return '';
    return parseInt(numericValue).toLocaleString('es-CL');
};

// Helper Component for Quantity Input
const QuantityInput = ({ value, onChange, min = 1, className }: { value: number, onChange: (val: number) => void, min?: number, className?: string }) => {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleBlur = () => {
        let val = parseInt(localValue);
        if (isNaN(val) || val < min) val = min;
        setLocalValue(val.toString());
        onChange(val);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <input
            type="number"
            value={localValue}
            onChange={(e) => {
                setLocalValue(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= min) {
                    // Optional: Live update if valid, or just wait for blur
                    // For cart responsiveness, we might want live update if valid
                    onChange(val);
                }
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={className}
        />
    );
};

// Helper: Obtener valor numérico limpio (sin puntos)
const parseFormattedNumber = (formatted: string): number => {
    return parseInt(formatted.replace(/\./g, '').replace(/[^0-9]/g, '') || '0');
};

const POSMainScreen: React.FC = () => {
    const [showQuoteHistory, setShowQuoteHistory] = useState(false);
    useKioskGuard(true); // Enable Kiosk Lock
    const {
        inventory, cart, addToCart, addManualItem, removeFromCart, clearCart,
        currentCustomer, getShiftMetrics, updateOpeningAmount,
        setCustomer, promotions, createQuote, retrieveQuote, updateCartItemQuantity,
        setInventory, splitBox
        // NOTE: processSale, redeemPoints, calculateDiscountValue, loyaltyConfig, employees, printerConfig
        // are now accessed via useCheckout hook in PaymentModal
    } = usePharmaStore();


    const {
        currentShift,
        currentLocationId,
        currentTerminalId,
        user
    } = usePharmaStore();

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const { currentLocation } = useLocationStore();
    console.log('🔍 [POSMainScreen] Current Location (Store):', currentLocation?.id, 'Current Location (Pharma):', currentLocationId);

    // 🚀 Load inventory via React Query (Prefer LocationStore ID as it's more reactive in UI)
    const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const activeLocationId = isUUID(currentLocation?.id || '')
        ? (currentLocation?.id as string)
        : isUUID(currentLocationId)
            ? currentLocationId
            : undefined;

    const { data: inventoryData, invalidateInventory } = useInventoryQuery(activeLocationId);

    // Sync React Query data to Zustand Store for compatibility with other components
    useEffect(() => {
        if (inventoryData) {
            console.log('🔄 [POS] Syncing Inventory Query -> Zustand');
            setInventory(inventoryData);
        }
    }, [inventoryData, setInventory]);

    // NOTE: enable_sii_integration, hardware now accessed via useCheckout hook in PaymentModal

    // ------------------------------------------------------------------
    // 🔄 SESSION RECOVERY: Persist session across reloads
    // ------------------------------------------------------------------

    // Consistency Check: Ensure Terminal ID is set if Shift is Active
    useEffect(() => {
        if (currentShift?.status === 'ACTIVE' && currentShift.terminal_id && !currentTerminalId) {
            console.log('🔄 Restoring Terminal Context from Active Shift:', currentShift.terminal_id);
            usePharmaStore.setState({ currentTerminalId: currentShift.terminal_id });
        }
    }, [currentShift, currentTerminalId]);

    useEffect(() => {
        const checkActiveSession = async () => {
            try {
                // Import actions dynamically
                const { getCashDrawerStatus, closeCashDrawerSystem } = await import('../../actions/cash-management-v2');

                // Guard: Need a terminal to check status
                if (!currentTerminalId) return;

                const status = await getCashDrawerStatus(currentTerminalId);

                // Si la consulta falló (error de BD o timeout), NO deslogueamos. 
                // Tolerancia a fallos de red.
                if (!status.success) {
                    console.warn('⚠️ [POS] Failed to fetch server status. Preserving local session. Error:', status.error);
                    return;
                }

                // --- CASE A: Validate Persisted Local Session ---
                if (currentShift) {
                    // En este punto status.success es TRUE. Evaluamos la respuesta de negocio.
                    const serverSessionId = status.data?.isOpen ? status.data.sessionId : null;

                    if (serverSessionId !== currentShift.id) {
                        console.warn('⚠️ [POS] Local session mismatch with server. Invalidating local session.');
                        usePharmaStore.getState().logoutShift();
                        toast.error('Sesión local no válida', { description: 'Su sesión expiró o fue cerrada remotamente.' });
                    } else {
                        console.log('✅ [POS] Local session validated with server.');
                    }
                    return;
                }

                // --- CASE B: Attempt Recovery (No Local Session) ---
                if (status.success && status.data?.isOpen && status.data.sessionId) {
                    const sessionUser = status.data.cashierId;
                    const currentUser = user?.id;

                    // SCENARIO 1: SAME USER -> RESUME SESSION (PERSISTENCE)
                    if (sessionUser === currentUser) {
                        console.log('🔄 [POS] Recovering active session for SAME user:', status.data.sessionId);
                        const recoveredShift: any = {
                            id: status.data.sessionId,
                            terminal_id: currentTerminalId,
                            user_id: currentUser || '',
                            opening_amount: Number(status.data.openingAmount || 0),
                            start_time: status.data.openedAt ? new Date(status.data.openedAt).getTime() : Date.now(),
                            status: 'ACTIVE'
                        };
                        usePharmaStore.getState().resumeShift(recoveredShift);
                        toast.success('Sesión recuperada', {
                            description: `Continuando turno de: ${status.data.cashierName || 'Usuario'}`
                        });
                    }
                    // SCENARIO 2: DIFFERENT USER -> AUTO-CLOSE PREVIOUS SESSION
                    else if (currentUser) {
                        console.warn('⚠️ [POS] Session User Mismatch. Auto-closing previous session.');

                        const closeResult = await closeCashDrawerSystem({
                            terminalId: currentTerminalId,
                            userId: currentUser, // action performed by current user
                            reason: `Cierre automático por cambio de usuario. (Anterior: ${status.data.cashierName}, Nuevo: ${user?.name})`
                        });

                        if (closeResult.success) {
                            toast.info('Turno anterior cerrado automáticamente', {
                                description: `Se cerró la sesión de ${status.data.cashierName} para que puedas operar.`,
                                duration: 8000,
                                icon: <RefreshCw className="animate-spin" />
                            });
                            // Do NOT resume. Let the UI show "Blocked" state so user can open new shift.
                        } else {
                            toast.error('Error cerrando turno anterior', { description: closeResult.error });
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to recover/check session', error);
            }
        };

        checkActiveSession();
    }, [currentTerminalId, currentShift?.id, user?.id]);

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
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    // Debounce search term to improve performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 80);
        return () => clearTimeout(timer);
    }, [searchTerm]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
    const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
    const [isLoadingQuote, setIsLoadingQuote] = useState(false); // Added missing state
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
    const [isCustomerSelectModalOpen, setIsCustomerSelectModalOpen] = useState(false);
    const [isQuickFractionModalOpen, setIsQuickFractionModalOpen] = useState(false);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false); // New State
    const [isShiftHistoryModalOpen, setIsShiftHistoryModalOpen] = useState(false); // New State
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isQuoteHistoryOpen, setIsQuoteHistoryOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Modular Cash Management States
    const [cashModalMode, setCashModalMode] = useState<'AUDIT' | 'CLOSE' | 'MOVEMENT' | null>(null);

    // Mobile View State (Native Experience)
    const [mobileView, setMobileView] = useState<'CATALOG' | 'CART'>('CATALOG');

    // Quote Mode
    const [isQuoteMode, setIsQuoteMode] = useState(false);

    // Express Product Creation
    const [isExpressModalOpen, setIsExpressModalOpen] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState('');

    // NOTE: isCheckoutProcessing, autoPrint, paymentMethod, transferId, pointsToRedeem
    // are now managed internally by PaymentModal via useCheckout hook

    // Helper for FEFO Selection
    const findBestBatch = (code: string) => {
        // Find all matches
        const matches = inventory.filter(p => p.sku === code || p.id === code || p.barcode === code);
        if (matches.length === 0) return undefined;

        const getPriority = (item: InventoryBatch): number => {
            const hasStock = (item.stock_actual || 0) > 0;
            if (hasStock && !item.is_retail_lot) return 0;
            if (hasStock && item.is_retail_lot) return 1;
            if (!item.is_retail_lot) return 2;
            return 3;
        };

        return [...matches].sort((a, b) => {
            const byPriority = getPriority(a) - getPriority(b);
            if (byPriority !== 0) return byPriority;
            return (a.expiry_date || 0) - (b.expiry_date || 0);
        })[0];
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
            // Trigger Express Creation
            setScannedBarcode(decodedText);
            setIsExpressModalOpen(true);
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
                // Trigger Express Creation via Hardware Scanner
                setScannedBarcode(code);
                setIsExpressModalOpen(true);
            }
        }
    });

    // --- GOD MODE OPTIMIZATIONS ---

    // 1. Pre-sort Inventory (FEFO) - Uses React Query data directly if synced
    const sortedInventory = useMemo(() => {
        const source = (inventoryData && inventoryData.length > 0) ? inventoryData : inventory;
        return sortInventoryForPOS(source);
    }, [inventory, inventoryData]);

    const posCatalog = useMemo(() => {
        return buildPOSCatalog(sortedInventory);
    }, [sortedInventory]);

    // 2. High-Speed Filter (Using debounced search term for performance)
    const filteredInventory = useMemo(() => {
        return filterInventoryForPOS(posCatalog, debouncedSearchTerm);
    }, [posCatalog, debouncedSearchTerm]);

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

    // 4. Async Scroll Sync with Keyboard Selection (Prevents flushSync error)
    useEffect(() => {
        if (filteredInventory.length > 0 && rowVirtualizer) {
            const timeoutId = setTimeout(() => {
                try {
                    rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
                } catch (e) {
                    console.warn('Scroll sync warned', e);
                }
            }, 0);
            return () => clearTimeout(timeoutId);
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

    const handlePrePayment = async () => {
        if (cart.length === 0 || isLoadingQuote) return;

        if (isQuoteMode) {
            setIsLoadingQuote(true);
            try {
                // Prepare quote data
                const quoteData = {
                    customerId: (currentCustomer?.id && currentCustomer.id.length > 10) ? currentCustomer.id : null, // Ensure valid UUID or null
                    customerName: currentCustomer?.fullName || undefined,
                    items: cartWithDiscounts.map(item => ({
                        productId: item.id,
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        discount: item.discount?.discountAmount ? (item.discount.discountAmount / item.price) * 100 : 0 // Fix type mismatch manually
                    })),
                    locationId: currentLocationId, // Ensure mapped from store
                    terminalId: currentTerminalId,
                    validDays: 7, // Default valid days
                };

                console.log('📝 [POS] Creating Quote Payload:', JSON.stringify(quoteData, null, 2)); // DEBUG
                const result = await createQuoteSecure(quoteData);

                if (result.success && result.quoteCode) {
                    toast.success(`Cotización Guardada: ${result.quoteCode} `, {
                        duration: 5000,
                        description: 'Código copiado al portapapeles. Imprimiendo...'
                    });

                    // AUTO-ADVANCE QUEUE LOGIC
                    const currentTicket = usePharmaStore.getState().currentTicket;
                    if (currentTicket && user?.id && currentTerminalId) {
                        try {
                            // We attempt to complete current ticket and call next
                            // We use the store action to keep UI in sync
                            const { completeAndNextTicket } = usePharmaStore.getState();
                            completeAndNextTicket(currentTerminalId, currentTicket.id).then((res) => {
                                if (res.nextTicket) {
                                    toast.success(`🔔 Siguiente: ${res.nextTicket.number}`);
                                } else {
                                    toast.info('Fila completada / Sin más tickets');
                                }
                            });
                        } catch (e) {
                            console.error('[POS] Auto-advance error:', e);
                        }
                    }

                    // Trigger Print (Open History Modal)
                    setShowQuoteHistory(true);

                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(result.quoteCode).catch(() => { });
                    }
                    clearCart();
                    setIsQuoteMode(false);
                } else {
                    toast.error(result.error || 'Error al guardar cotización');
                }
            } catch (error: any) {
                toast.error('Error de conexión o servidor');
                console.error(error);
            } finally {
                setIsLoadingQuote(false);
            }
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
            const result = await validateSupervisorPin(supervisorPin);
            if (result.success) {
                updateOpeningAmount(parseFormattedNumber(newBaseAmount));
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
        }
    };


    // ... (rest of the component logic)

    const openFractionModal = (e: React.MouseEvent, product: InventoryBatch) => {
        e.stopPropagation();
        setSelectedProductForFraction(product);
        setIsQuickFractionModalOpen(true);
    };

    const handleFractionConfirm = async (data: { quantity: number; unitPrice: number; unitsPerBox: number }) => {
        if (selectedProductForFraction) {
            const { quantity, unitPrice, unitsPerBox } = data;

            let lotToUse = selectedProductForFraction;

            // Si el lote que estamos fraccionando NO es ya un lote al detal, 
            // creamos/actualizamos el lote detal mediante splitBox
            if (!selectedProductForFraction.is_retail_lot) {
                const result = await splitBox(selectedProductForFraction.id, unitsPerBox);

                if (result.success && result.newBatchId) {
                    // Invalidamos para que React Query refresque
                    invalidateInventory();

                    // Buscamos el lote recién creado/actualizado en el store local (sincronizado)
                    // Nota: Como invalidamos, el store se actualizará pronto, pero para el addToCart inmediato
                    // podemos intentar buscarlo o construir el objeto.
                    const updatedItem = usePharmaStore.getState().inventory.find(i => i.id === result.newBatchId);
                    if (updatedItem) {
                        lotToUse = updatedItem;
                    } else {
                        // Fallback: Si aún no se sincroniza, construimos un objeto temporal
                        lotToUse = {
                            ...selectedProductForFraction,
                            id: result.newBatchId,
                            is_retail_lot: true,
                            stock_actual: unitsPerBox,
                            name: `[AL DETAL] ${selectedProductForFraction.name}`,
                            original_batch_id: selectedProductForFraction.id
                        };
                    }
                } else {
                    return; // Error ya manejado por el store (toast)
                }
            }

            // Agregamos al carrito con el precio dinámico
            addToCart(lotToUse, quantity, {
                is_fractional: true,
                price: unitPrice,
                name: `🔵 ${lotToUse.name} x1`
            });

            toast.success(`Caja abierta: ${quantity} unidades agregadas`);
            setIsQuickFractionModalOpen(false);
        }
    };

    const getRetailAlternative = useCallback((fullItem?: InventoryBatch | null): InventoryBatch | undefined => {
        if (!fullItem) return undefined;
        return selectRetailLotCandidate(inventory, fullItem);
    }, [inventory]);

    const switchCartItemToRetailLot = useCallback((cartItem: CartItem, fullItem?: InventoryBatch | null) => {
        const retailLot = getRetailAlternative(fullItem);
        if (!retailLot) {
            toast.info('No hay lote al detal disponible para este producto');
            return;
        }

        const requestedQty = Number(cartItem.quantity || 1);
        const availableQty = Number(retailLot.stock_actual || 0);
        const nextQty = Math.max(1, Math.min(requestedQty, availableQty));

        removeFromCart(cartItem.id);
        addToCart(retailLot, nextQty);

        if (nextQty < requestedQty) {
            toast.warning(`Detalle limitado a ${nextQty} unidad(es) por stock disponible`);
        } else {
            toast.success('Producto cambiado a lote al detal');
        }
    }, [addToCart, getRetailAlternative, removeFromCart]);

    // --- MISSING LOCATION STATE RENDER ---
    if (!currentLocationId) {
        return (
            <div className="min-h-dvh w-full bg-slate-100 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-lg w-full text-center border border-slate-200">
                    <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CornerDownLeft size={48} className="text-amber-500" />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Sucursal No Detectada</h1>
                    <p className="text-slate-500 mb-8 text-lg">Seleccione una sucursal para operar el POS.</p>
                    <a href="/app" className="block w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-lg transition-all">
                        Volver al Dashboard
                    </a>
                </div>
            </div>
        );
    }

    // --- BLOCKED STATE RENDER ---
    if (!currentShift || currentShift.status === 'CLOSED') {
        return (
            <div className="min-h-dvh w-full bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Subtle Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>

                <div className="z-10 bg-white border border-slate-200 p-8 md:p-12 rounded-[40px] shadow-2xl shadow-sky-900/5 max-w-lg w-full text-center">
                    <div className="w-24 h-24 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-100">
                        <Lock size={48} className="text-red-500" />
                    </div>

                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">Terminal Bloqueado</h1>
                    <p className="text-slate-500 mb-10 text-lg leading-relaxed font-medium">Se requiere apertura de caja para operar el punto de venta.</p>

                    <button
                        onClick={() => setIsShiftModalOpen(true)}
                        className="w-full py-5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-2xl text-xl shadow-lg shadow-sky-600/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] border-b-4 border-sky-800"
                    >
                        Solicitar Apertura a Gerente
                    </button>

                    <div className="mt-12 pt-8 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Farmacias Vallenar Suit v2.1</p>
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
        <div className="flex h-[calc(100dvh-80px)] bg-slate-100 overflow-hidden">

            {/* COL 1: Búsqueda (Fixed 400px Desktop, 100% Mobile Catalog View) */}
            <div className={`w-full md:w-[400px] flex-col p-4 md:p-6 md:pr-3 gap-4 h-full ${mobileView === 'CART' ? 'hidden md:flex' : 'flex'}`}>
                {/* ... (existing content logic is fine, we just want to replace the container logic if needed, but here we cover lines 82-607, so we need to be careful with the huge replacement) */}
                {/* Wait, I cannot replace 500 lines efficiently if they haven't changed. */}
                {/* I should target smaller chunks. */}


                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    {/* Barra de Búsqueda de vuelta a la Izquierda */}
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-600 transition-colors" size={20} />
                            <input
                                type="text"
                                ref={searchInputRef}
                                placeholder="Buscar productos... (F2)"
                                className="w-full pl-11 pr-12 py-3 bg-white hover:bg-slate-50 focus:bg-white rounded-2xl border border-slate-200 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 outline-none transition-all text-lg font-bold"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDownInput}
                                autoFocus
                            />
                            <button
                                onClick={() => setSearchTerm('')}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all ${searchTerm ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* List Header (Desktop Only) */}
                    <div className="hidden md:flex p-3 bg-slate-50/50 border-b border-slate-100 justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {searchTerm.trim()
                                ? `${filteredInventory.length} encontrados`
                                : `${filteredInventory.length} en catálogo`}
                        </span>
                    </div>

                    <div
                        ref={parentRef}
                        className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4 touch-pan-y overscroll-contain"
                    >
                        {filteredInventory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
                                <Search size={48} className="mb-4" />
                                <p className="text-sm font-bold">
                                    {searchTerm.trim() ? 'Sin resultados para esta búsqueda' : 'Sin productos disponibles'}
                                </p>
                            </div>
                        ) : (
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                    contain: 'strict'
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                                    // Virtualizer Row Rendering
                                    const item = filteredInventory[virtualRow.index];
                                    const isSelected = virtualRow.index === selectedIndex;

                                    if (!item) return null; // Guard

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
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <div
                                                onClick={() => addToCart(item, 1)} // Original behavior for click
                                                onDoubleClick={() => addToCart(item, 1)} // Assuming double click also adds to cart
                                                className={`group relative p-4 mb-3 rounded-2xl border transition-all cursor-pointer select-none overflow-hidden ${item.is_retail_lot
                                                    ? (isSelected
                                                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 border-amber-500 shadow-lg shadow-amber-200 -translate-y-0.5'
                                                        : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100 shadow-sm')
                                                    : (isSelected
                                                        ? 'bg-cyan-600 border-cyan-500 shadow-lg shadow-cyan-100 -translate-y-0.5'
                                                        : 'bg-white border-slate-200 hover:border-cyan-300 hover:shadow-md')
                                                    }`}
                                            >
                                                {/* Badge de Detalle */}
                                                {item.is_retail_lot && !isSelected && (
                                                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-tighter">
                                                        Caja Abierta
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h5 className={`font-bold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                                                {item.name}
                                                            </h5>
                                                            {item.is_retail_lot && (
                                                                <span className={`flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md border ${isSelected
                                                                    ? 'bg-white/25 text-white border-white/40'
                                                                    : 'bg-amber-100 text-amber-700 border-amber-200'
                                                                    }`}>
                                                                    DETAL
                                                                </span>
                                                            )}
                                                            {item.bioequivalent && (
                                                                <span className="flex-shrink-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded-md">BE</span>
                                                            )}
                                                        </div>
                                                        <p className={`text-xs truncate ${isSelected ? 'text-cyan-100' : 'text-slate-400'}`}>
                                                            {item.sku} • {item.laboratory}
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className={`text-lg font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                                            ${(item.is_retail_lot ? (item.price_sell_unit || Math.round(item.price / (item.units_per_box || 1))) : item.price).toLocaleString()}
                                                        </p>
                                                        <div className="flex items-center justify-end gap-1 mt-1">
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected
                                                                ? 'bg-white/20 text-white'
                                                                : item.stock_actual <= item.stock_min
                                                                    ? 'bg-red-100 text-red-600'
                                                                    : item.is_retail_lot
                                                                        ? 'bg-amber-200 text-amber-800'
                                                                        : 'bg-slate-100 text-slate-600'
                                                                }`}>
                                                                {item.stock_actual} {item.is_retail_lot ? 'unidades' : 'cajas'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {virtualRow.index === selectedIndex && (
                                                    <span className="absolute bottom-3 left-4 flex items-center gap-1 text-[10px] font-bold text-cyan-100 animate-pulse bg-white/20 px-2 py-0.5 rounded-full">
                                                        <CornerDownLeft size={12} /> ENTER
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
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
            <div className={`fixed inset-0 z-50 bg-slate-100 md:static md:bg-transparent md:z-auto md:flex md:flex-1 flex-col p-4 pt-safe pb-safe md:p-6 md:pl-0 gap-4 ${mobileView === 'CART' ? 'flex' : 'hidden'} md:flex`}>
                {/* QueueWidget se movió al header del carrito */}

                <div className={`flex-1 rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full transition-colors ${isQuoteMode ? 'bg-amber-50 border-amber-200' : 'bg-white'} `}>
                    {/* Header */}
                    <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center bg-slate-50/50 gap-4">
                        <div className="flex items-center gap-4 justify-between md:justify-start w-full md:w-auto">
                            <div className="flex items-center gap-4">
                                {/* Mobile Back Button */}
                                <button
                                    onClick={() => setMobileView('CATALOG')}
                                    className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-200 rounded-full mr-2"
                                >
                                    <TrendingDown className="rotate-90" size={24} />
                                </button>

                                <div className={`p-2 md:p-3 rounded-2xl hidden md:block ${isQuoteMode ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'} `}>
                                    {isQuoteMode ? <FileText size={28} /> : <ShoppingCart size={28} />}
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                                        {isQuoteMode ? 'Cotización' : 'Carrito'}
                                    </h1>
                                    {isQuoteMode ? (
                                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full w-fit">MODO COTIZACIÓN</span>
                                    ) : (
                                        <p className="text-xs font-medium text-slate-400">Resumen de venta</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* DESKTOP STATUS (Replacing search bar in header) */}
                        <div className="flex-1 max-w-2xl mx-4 hidden md:flex items-center gap-4">
                            <div className="h-10 w-px bg-slate-200 mx-2" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Terminal Activo</span>
                                <span className="text-sm font-bold text-slate-600">{currentLocation?.name} - {user?.name}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* UNIFIED HEADER ACTIONS (Teleported to Header) */}
                            {mounted && document.getElementById('header-actions-portal') && createPortal(
                                <div className="flex items-center gap-3">
                                    {/* 1. Queue Widget */}
                                    <QueueWidget />

                                    {/* 2. Divider */}
                                    <div className="h-8 w-px bg-slate-200 mx-1 hidden lg:block" />

                                    {/* 3. Client Selector */}
                                    <div className="flex items-center gap-2">
                                        {currentCustomer ? (
                                            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm transition-all hover:shadow-md cursor-pointer group" onClick={() => setIsCustomerSelectModalOpen(true)}>
                                                <User size={16} />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-emerald-500 leading-none">Cliente</span>
                                                    <span className="text-xs font-bold leading-none">{currentCustomer.fullName.split(' ')[0]}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setCustomer(null); }}
                                                    className="p-1 hover:bg-emerald-200 rounded-full ml-1 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsCustomerSelectModalOpen(true)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-sm"
                                            >
                                                <User size={16} className="text-slate-400" />
                                                <div className="flex flex-col items-start">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 leading-none">Cliente</span>
                                                    <span className="text-xs font-bold leading-none">Anónimo</span>
                                                </div>
                                                <Plus size={12} className="ml-1 text-slate-400" />
                                            </button>
                                        )}
                                    </div>

                                    {/* 4. Divider */}
                                    <div className="h-8 w-px bg-slate-200 mx-1 hidden lg:block" />

                                    {/* 5. Actions */}
                                    <POSHeaderActions
                                        shiftStatus={currentShift?.status}
                                        shiftId={currentShift?.id}
                                        operatorName={user?.name}
                                        locationName={currentLocation?.name}
                                        onHandover={() => setIsHandoverModalOpen(true)}
                                        onMovement={() => setCashModalMode('MOVEMENT')}
                                        onAudit={() => setCashModalMode('AUDIT')}
                                        onCloseTurn={() => setCashModalMode('CLOSE')}
                                        onOpenTurn={() => setIsShiftModalOpen(true)}
                                        onHistory={() => setIsHistoryModalOpen(true)}
                                        onShiftHistory={() => setIsShiftHistoryModalOpen(true)} // Added missing prop
                                        onQuoteHistory={() => {
                                            console.log('📜 [POS] Abriendo Historial Cotizaciones'); // Debug
                                            setIsQuoteHistoryOpen(true);
                                        }}
                                        onQuote={() => setIsQuoteMode(!isQuoteMode)}
                                        isQuoteMode={isQuoteMode}
                                        onManualItem={() => setIsManualItemModalOpen(true)}
                                        onClearCart={clearCart}
                                    />
                                </div>,
                                document.getElementById('header-actions-portal')!
                            )}

                            {/* Fallback for Mobile (Render inline if no portal target or is mobile) */}
                            <div className="lg:hidden text-slate-400">
                                <POSHeaderActions
                                    shiftStatus={currentShift?.status}
                                    shiftId={currentShift?.id}
                                    operatorName={user?.name}
                                    locationName={currentLocation?.name}
                                    onHandover={() => setIsHandoverModalOpen(true)}
                                    onMovement={() => setCashModalMode('MOVEMENT')}
                                    onAudit={() => setCashModalMode('AUDIT')}
                                    onCloseTurn={() => setCashModalMode('CLOSE')}
                                    onOpenTurn={() => setIsShiftModalOpen(true)}
                                    onHistory={() => setIsHistoryModalOpen(true)}
                                    onShiftHistory={() => setIsShiftHistoryModalOpen(true)}
                                    onQuoteHistory={() => setShowQuoteHistory(true)}
                                    onQuote={() => setIsQuoteMode(!isQuoteMode)}
                                    isQuoteMode={isQuoteMode}
                                    onManualItem={() => setIsManualItemModalOpen(true)}
                                    onClearCart={clearCart}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 touch-pan-y overscroll-contain">
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
                                            {cartWithDiscounts.map((item, index) => {
                                                const fullItem = inventory.find(i => i.id === item.id || i.id === item.batch_id);
                                                const retailAlternative = getRetailAlternative(fullItem);
                                                return (
                                                    <tr key={item.id || item.sku || `item-${index}`} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="p-4">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-slate-800 text-lg leading-tight">
                                                                        {fullItem ? formatProductLabel(fullItem) : item.name}
                                                                    </span>
                                                                    {!item.is_fractional && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (fullItem) openFractionModal(e, fullItem);
                                                                            }}
                                                                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                                            title="Fraccionar caja"
                                                                        >
                                                                            <Scissors size={14} />
                                                                        </button>
                                                                    )}
                                                                    {!item.is_fractional && retailAlternative && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                switchCartItemToRetailLot(item, fullItem);
                                                                            }}
                                                                            className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors"
                                                                            title="Cambiar a lote al detal"
                                                                        >
                                                                            Cambiar a Detal
                                                                        </button>
                                                                    )}
                                                                </div>
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
                                                                    onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                                                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 disabled:opacity-50 border border-slate-200"
                                                                    disabled={item.quantity <= 1}
                                                                >
                                                                    <Minus size={16} />
                                                                </button>
                                                                <QuantityInput
                                                                    value={item.quantity}
                                                                    onChange={(val) => updateCartItemQuantity(item.id, val)}
                                                                />
                                                                <button
                                                                    onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
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
                                                                onClick={() => removeFromCart(item.id)}
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
                                    {cartWithDiscounts.map((item, index) => {
                                        const fullItem = inventory.find(i => i.id === item.id || i.id === item.batch_id);
                                        const retailAlternative = getRetailAlternative(fullItem);
                                        return (
                                            <div key={item.id || item.sku || `item-${index}`} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-bold text-slate-800 text-base">{fullItem ? formatProductLabel(fullItem) : item.name}</h3>
                                                        {!item.is_fractional && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (fullItem) openFractionModal(e, fullItem);
                                                                }}
                                                                className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                            >
                                                                <Scissors size={14} />
                                                            </button>
                                                        )}
                                                        {!item.is_fractional && retailAlternative && (
                                                            <button
                                                                onClick={() => switchCartItemToRetailLot(item, fullItem)}
                                                                className="px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-md"
                                                            >
                                                                Detal
                                                            </button>
                                                        )}
                                                        {item.discount && (
                                                            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                <Tag size={10} /> OFERTA
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                                        <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200">
                                                            <button
                                                                onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                                                                className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600 border-r border-slate-200"
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                className="w-12 text-center bg-transparent font-medium focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                value={item.quantity}
                                                                onChange={(e) => updateCartItemQuantity(item.id, parseInt(e.target.value) || 1)}
                                                            />
                                                            <button
                                                                onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
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
                                                    onClick={() => removeFromCart(item.id)}
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
                                disabled={cart.length === 0 || !currentShift || currentShift.status !== 'ACTIVE' || isLoadingQuote}
                                className={`w-full md:w-auto px-10 md:px-16 py-6 md:py-8 rounded-xl font-extrabold text-2xl md:text-4xl shadow-xl transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${isQuoteMode
                                    ? 'bg-slate-700 hover:bg-slate-600 text-white shadow-slate-900/30'
                                    : 'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 border-2 border-amber-600/50 text-slate-900 shadow-amber-500/40'
                                    }`}
                            >
                                {isLoadingQuote ? 'GUARDANDO...' : (isQuoteMode ? 'GUARDAR COTIZACIÓN' : 'PAGAR')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <QuoteHistoryModal
                isOpen={showQuoteHistory}
                onClose={() => setShowQuoteHistory(false)}
            />

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
            {
                cashModalMode && (
                    <CashManagementModal // Note: Ensure this is imported correctly as CashManagementModal, not CashControlModal
                        isOpen={!!cashModalMode}
                        onClose={() => setCashModalMode(null)}
                        mode={cashModalMode}
                    />
                )
            }

            <CashOutModal
                isOpen={isCashOutModalOpen}
                onClose={() => setIsCashOutModalOpen(false)}
            />

            <ShiftHistoryModal
                isOpen={isShiftHistoryModalOpen}
                onClose={() => setIsShiftHistoryModalOpen(false)}
            />

            <QuickFractionModal
                isOpen={isQuickFractionModalOpen}
                onClose={() => setIsQuickFractionModalOpen(false)}
                product={selectedProductForFraction}
                onConfirm={handleFractionConfirm}
            />

            {/* Edit Base Modal */}
            {
                isEditBaseModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Ajustar Base Inicial</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Nuevo Monto Base (Efectivo Sencillo)</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold text-lg"
                                        value={newBaseAmount}
                                        onChange={(e) => {
                                            const formatted = formatWithThousands(e.target.value);
                                            setNewBaseAmount(formatted);
                                        }}
                                        placeholder="$100.000"
                                    />
                                    {newBaseAmount && (
                                        <p className="text-xs text-slate-500 mt-1 text-right">
                                            Valor: ${formatWithThousands(newBaseAmount)} CLP
                                        </p>
                                    )}
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
                )
            }

            {/* Payment Modal - Now using modular component */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onSuccess={() => {
                    // Optional: track successful sales for analytics
                    console.log('[POS] Sale completed successfully');
                }}
            />
            {
                isScannerOpen && (
                    <CameraScanner
                        onScan={handleScan}
                        onClose={() => setIsScannerOpen(false)}
                    />
                )
            }

            <TransactionHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                locationId={currentLocationId || currentLocation?.id}
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
            {
                isScannerOpen && (
                    <MobileScanner
                        onScan={handleScan}
                        onClose={() => setIsScannerOpen(false)}
                        continuous={true} // Allow multiple scans
                    />
                )
            }

            {/* FAB for Mobile Scan */}
            <div className="md:hidden fixed bottom-24 right-4 z-40">
                <button
                    onClick={() => setIsScannerOpen(true)}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-lg shadow-black/20"
                >
                    <ScanBarcode size={28} />
                </button>
            </div>


            <QuoteHistoryModal
                isOpen={isQuoteHistoryOpen}
                onClose={() => setIsQuoteHistoryOpen(false)}
            />

            <ExpressAddProductModal
                isOpen={isExpressModalOpen}
                scannedBarcode={scannedBarcode}
                onClose={() => setIsExpressModalOpen(false)}
                onSuccess={(newProduct) => {
                    // Type assertion may be needed depending on strictness, but structure matches
                    addToCart(newProduct as any, 1);
                }}
            />
        </div >
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
