
import { create } from 'zustand';
import { useLocationStore } from './useLocationStore';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
    InventoryBatch, EmployeeProfile, SaleItem, Customer, QueueTicket, Supplier, PurchaseOrder, CartItem, SaleTransaction, Expense, CashShift, CashMovement, CashMovementReason, AttendanceLog,
    SupplierDocument,
    PrinterConfig,
    SiiConfiguration,
    SiiCaf,
    DteDocument,
    DteTipo,
    Promotion,
    GiftCard,
    LoyaltyReward,
    LoyaltyConfig,
    Shipment,
    StockTransfer,
    WarehouseIncident,
    AttendanceStatus,
    AttendanceType,
    Shift,
    Terminal,
    Quote,
    ReorderConfig,
    AutoOrderSuggestion,
    StockMovement,
    Location
} from '../../domain/types';
import { TigerDataService } from '../../domain/services/TigerDataService';
import { IntelligentOrderingService } from '../services/intelligentOrderingService';
import { forceCloseTerminalShift } from '../../actions/terminals-v2';
import { createTerminalSecure, deleteTerminalSecure, updateTerminalSecure } from '../../actions/network-v2';
// Mocks removed
// Mocks removed


// --- MOCKS MOVED TO src/domain/mocks.ts ---

interface PharmaState {
    // --- Multi-Branch State ---
    currentLocationId: string;
    currentWarehouseId: string;
    currentTerminalId: string;
    setCurrentLocation: (locationId: string, warehouseId: string, terminalId: string) => void;

    // Auth
    user: EmployeeProfile | null;
    employees: EmployeeProfile[]; // Store loaded employees
    login: (userId: string, pin: string, locationId?: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;

    // Data Sync
    isLoading: boolean;
    isInitialized: boolean;
    syncData: (options?: { force?: boolean }) => Promise<void>;

    // Inventory
    inventory: InventoryBatch[];
    setInventory: (inventory: InventoryBatch[]) => void;
    suppliers: Supplier[];
    supplierDocuments: SupplierDocument[];
    purchaseOrders: PurchaseOrder[];
    updateStock: (batchId: string, quantity: number) => void;
    addStock: (batchId: string, quantity: number, expiry?: number) => void;
    addNewProduct: (product: InventoryBatch) => void;
    // fetchInventory removed - migrated to React Query
    transferStock: (batchId: string, targetLocation: string, quantity: number) => Promise<void>;
    addPurchaseOrder: (po: PurchaseOrder) => void;
    receivePurchaseOrder: (poId: string, receivedItems: { sku: string, receivedQty: number; lotNumber?: string; expiryDate?: number }[], destinationLocationId: string) => Promise<void>;
    cancelPurchaseOrder: (poId: string) => void;
    removePurchaseOrder: (poId: string) => void;
    updatePurchaseOrder: (id: string, data: Partial<PurchaseOrder>) => void;

    // SRM Actions

    addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>;
    updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
    addSupplierDocument: (doc: Omit<SupplierDocument, 'id'>) => void;

    // POS & Cart
    cart: CartItem[];
    currentCustomer: Customer | null;
    setCustomer: (customer: Customer | null) => void;
    addToCart: (batch: InventoryBatch, quantity: number) => void;
    updateCartItemQuantity: (sku: string, quantity: number) => void;
    addManualItem: (item: { description: string, price: number, quantity: number, sku?: string, is_fractional?: boolean, original_name?: string, active_ingredients?: string[] }) => void;
    removeFromCart: (sku: string) => void;
    clearCart: () => void;
    processSale: (paymentMethod: string, customer?: Customer) => Promise<boolean>;

    // Quotes
    quotes: Quote[];
    createQuote: (customer?: Customer) => Promise<Quote | null>;
    retrieveQuote: (quoteId: string) => Promise<boolean>; // Returns true if found and loaded

    // Inventory Actions
    createProduct: (product: Omit<InventoryBatch, 'id'>) => InventoryBatch;
    updateProduct: (id: string, data: Partial<InventoryBatch>) => void;
    deleteProduct: (id: string) => void;
    getProductBySKU: (sku: string) => InventoryBatch | undefined;
    updateBatchDetails: (productId: string, batchId: string, data: Partial<InventoryBatch>) => void;
    registerStockMovement: (batchId: string, quantity: number, type: 'SALE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT' | 'RECEIPT') => void;
    clearInventory: () => void;

    // WMS Helpers
    getInventoryByLocation: (locationId: string) => InventoryBatch[];
    getAvailableStockAtLocation: (sku: string, locationId: string) => number;

    // Printer & Hardware
    printerConfig: PrinterConfig;
    updatePrinterConfig: (config: Partial<PrinterConfig>) => void;

    // CRM
    customers: Customer[];
    fetchCustomers: (searchTerm?: string) => Promise<void>;
    addCustomer: (customer: Omit<Customer, 'id' | 'totalPoints' | 'lastVisit' | 'health_tags' | 'name' | 'age'>) => Promise<Customer | null>;
    updateCustomer: (id: string, data: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    redeemPoints: (customerId: string, points: number) => boolean;

    // BI & Reports
    salesHistory: SaleTransaction[];
    expenses: Expense[];
    addExpense: (expense: Omit<Expense, 'id'>) => void;

    // Locations & Context
    locations: Location[];
    fetchLocations: () => Promise<void>;
    fetchTerminals: (locationId: string) => Promise<void>;

    // Cash Management & Shifts
    currentShift: Shift | null;
    dailyShifts: Shift[]; // History of shifts for the day
    terminals: Terminal[];
    addTerminal: (terminal: Omit<Terminal, 'id'>, adminPin: string) => Promise<void>;
    updateTerminal: (id: string, updates: Partial<Terminal>, adminPin: string) => Promise<void>;
    deleteTerminal: (id: string, adminPin: string) => Promise<void>;
    forceCloseTerminal: (id: string) => Promise<void>;
    cashMovements: CashMovement[];

    openShift: (amount: number, cashierId: string, authorizedBy: string, terminalId: string, locationId: string, sessionId?: string) => void;
    resumeShift: (shift: Shift) => void;
    logoutShift: () => void; // Force local logout of shift
    closeShift: (finalAmount: number, authorizedBy: string) => void;
    updateOpeningAmount: (newAmount: number) => void;
    registerCashMovement: (movement: Omit<CashMovement, 'id' | 'timestamp' | 'shift_id' | 'user_id'>) => void;
    getShiftMetrics: () => {
        totalSales: number;
        cashSales: number;
        cardSales: number;
        transferSales: number;
        initialFund: number;
        totalOutflows: number;
        expectedCash: number;
    };
    processReturn: (saleId: string, reason: string, authorizedBy: string) => void;

    // Attendance & HR
    attendanceLogs: AttendanceLog[];
    registerAttendance: (employeeId: string, type: AttendanceType, observation?: string, evidence_photo_url?: string, overtimeMinutes?: number) => Promise<void>;
    updateEmployeeBiometrics: (employeeId: string, credentialId: string) => void;

    // WMS & Logistics
    stockTransfers: StockTransfer[]; // Legacy
    shipments: Shipment[]; // New
    warehouseIncidents: WarehouseIncident[];
    dispatchTransfer: (transfer: Omit<StockTransfer, 'id' | 'status' | 'timeline'>) => void;
    receiveTransfer: (transferId: string, incidents?: Omit<WarehouseIncident, 'id' | 'transfer_id' | 'reported_at' | 'status'>[]) => void;

    // Logistics
    createDispatch: (shipmentData: Omit<Shipment, 'id' | 'status' | 'created_at' | 'updated_at'>) => void;
    confirmReception: (shipmentId: string, data: { photos: string[], notes: string, receivedItems: { batchId: string, quantity: number, condition: 'GOOD' | 'DAMAGED' }[] }) => void;
    uploadLogisticsDocument: (shipmentId: string, type: 'INVOICE' | 'GUIDE' | 'PHOTO', url: string, observations?: string) => void;
    cancelShipment: (shipmentId: string) => void;
    refreshShipments: (locationId?: string) => Promise<void>;

    // Import
    importInventory: (items: InventoryBatch[]) => void;

    // Queue
    tickets: QueueTicket[];
    currentTicket: QueueTicket | null;
    lastQueueActionTimestamp: number;
    setCurrentTicket: (ticket: QueueTicket | null) => void;
    generateTicket: (rut?: string, branch_id?: string, type?: string) => Promise<QueueTicket>;
    callNextTicket: (counterId: string) => Promise<QueueTicket | null>;
    completeAndNextTicket: (counterId: string, currentTicketId: string) => Promise<{ nextTicket: QueueTicket | null, completedTicket: QueueTicket | null }>;
    refreshQueueStatus: () => Promise<void>;
    addTicketToQueue: (ticket: QueueTicket) => void; // Sync helper

    // SII (Facturación Electrónica)
    siiConfiguration: SiiConfiguration | null;
    siiCafs: SiiCaf[];
    dteDocuments: DteDocument[];
    updateSiiConfiguration: (config: SiiConfiguration) => void;
    addCaf: (caf: Omit<SiiCaf, 'id'>) => void;
    getAvailableFolios: (tipoDte: DteTipo) => number;

    // Loyalty
    loyaltyConfig: LoyaltyConfig;
    updateLoyaltyConfig: (config: Partial<LoyaltyConfig>) => void;
    calculatePointsEarned: (amount: number) => number;
    calculateDiscountValue: (points: number) => number;

    // Marketing & Promotions
    promotions: Promotion[];
    giftCards: GiftCard[];
    loyaltyRewards: LoyaltyReward[];
    addPromotion: (promo: Promotion) => void;
    togglePromotion: (id: string) => void;
    createGiftCard: (amount: number) => GiftCard;
    redeemGiftCard: (code: string, amount: number) => boolean;
    getGiftCard: (code: string) => GiftCard | undefined;

    // Intelligent Ordering (Phase 3)
    reorderConfigs: ReorderConfig[];
    setReorderConfig: (config: ReorderConfig) => void;
    getReorderConfig: (sku: string, locationId: string) => ReorderConfig | undefined;
    getSalesHistory: (sku: string, locationId: string, days: number) => { total: number; daily_avg: number };
    analyzeReorderNeeds: (locationId: string, analysisDays?: number) => AutoOrderSuggestion[];
    generateSuggestedPOs: (suggestions: AutoOrderSuggestion[]) => PurchaseOrder[];
}


import { indexedDBWithLocalStorageFallback } from './indexedDBStorage';

export const usePharmaStore = create<PharmaState>()(
    persist(
        (set, get) => ({
            // --- Multi-Branch State ---
            currentLocationId: '', // Default empty to force selection
            currentWarehouseId: '', // Default empty
            currentTerminalId: '', // Default empty
            setCurrentLocation: (loc, wh, term) => {
                const prevLoc = get().currentLocationId;

                // Set new context
                set({ currentLocationId: loc, currentWarehouseId: wh, currentTerminalId: term });

                // If location changed, refresh data
                if (loc && loc !== prevLoc) {
                    console.log(`📍 Context Switch: ${prevLoc} -> ${loc}. Refreshing Data...`);
                    // 1. Clear current inventory to prevent stale data ghosting
                    set({ inventory: [], isLoading: true });

                    // 2. Fetch new data
                    get().fetchTerminals(loc);
                    // fetchInventory removed - handled by React Query in components
                }
            },

            // --- Auth ---
            user: null, // ALWAYS start logged out - force login
            employees: [], // ⚠️ DEBUG: Start empty to prove DB connection
            login: async (userId, pin, locationId) => {
                let authenticatedUser: EmployeeProfile | null = null;

                // 1. Online Attempt (Secure Server Action with bcrypt)
                try {
                    // Dynamic import of Server Action (using secure v2 with bcrypt)
                    const { authenticateUserSecure } = await import('../../actions/auth-v2');

                    // Add timeout to prevent indefinite hanging (20 seconds) -- Increased for cold starts
                    const timeoutPromise = new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error('Login timeout')), 20000)
                    );

                    const result = await Promise.race([
                        authenticateUserSecure(userId, pin, locationId),
                        timeoutPromise
                    ]);

                    if (result.success && result.user) {
                        // Cast to EmployeeProfile - auth-v2 returns compatible user data
                        authenticatedUser = result.user as EmployeeProfile;
                    } else if (result.error) {
                        // Capture server error for potential feedback
                        console.warn('⚠️ Server Login Error:', result.error);

                        // If explicit blocking error (not just invalid credentials), notify immediately
                        if (result.error.includes('No tienes contrato') || result.error.includes('Bloqueado')) {
                            import('sonner').then(({ toast }) => toast.error(result.error));
                            return { success: false, error: result.error };
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Online login failed/timeout, trying offline fallback...', error);
                }

                // 2. Offline Fallback
                if (!authenticatedUser) {
                    const { employees } = get();
                    // Hash del PIN input para comparar con lo almacenado (si fue persistido hash)
                    const hashedPin = typeof window !== 'undefined' ? window.btoa(pin).split('').reverse().join('') : pin;

                    const offlineUser = employees.find(e =>
                        e.id === userId && (e.access_pin === pin || e.access_pin === hashedPin)
                    );

                    if (offlineUser) {
                        authenticatedUser = offlineUser;
                        import('sonner').then(({ toast }) => {
                            toast.warning('⚠️ Modo Offline Activado', {
                                description: 'Iniciando sesión con credenciales locales.',
                                duration: 4000,
                            });
                        });
                    }
                }

                if (authenticatedUser) {
                    // Set User
                    set({ user: authenticatedUser });

                    // Auto-Set Location Context based on User Assignment (Non-Blocking)
                    if (authenticatedUser.assigned_location_id) {
                        (async () => {
                            try {
                                const { getLocationsSecure } = await import('../../actions/locations-v2');
                                const locRes = await getLocationsSecure();
                                if (locRes.success && locRes.data) {
                                    const assignedLoc = locRes.data.find(l => l.id === authenticatedUser!.assigned_location_id);
                                    if (assignedLoc) {
                                        const warehouseId = assignedLoc.default_warehouse_id || '';
                                        const currentLoc = get().currentLocationId;

                                        // Only update if location changed or not set
                                        if (currentLoc !== assignedLoc.id) {
                                            console.log(`📍 Auto-Setting Context: Location=${assignedLoc.name}, Warehouse=${warehouseId}`);
                                            set({
                                                currentLocationId: assignedLoc.id,
                                                currentWarehouseId: warehouseId,
                                                currentTerminalId: '' // Reset terminal only on location change
                                            });

                                            // ⚡️ Refresh Inventory for the new context (Non-blocking)
                                            // if (warehouseId) {
                                            //    get().fetchInventory(assignedLoc.id, warehouseId).catch(console.error);
                                            // }
                                        } else {
                                            console.log('📍 Context stable. Preserving session.');
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('Failed to auto-set location context:', e);
                            }
                        })();
                    }

                    // Persistence: Save Location Context
                    if (locationId) {
                        try {
                            // Save to LocalStorage for persistence across reloads
                            try { localStorage.setItem('context_location_id', locationId); } catch (e) { }

                            // Set in Store if not already set by auto-assign logic
                            const state = get();
                            let warehouseId = '';
                            if (state.locations.length > 0) {
                                const loc = state.locations.find(l => l.id === locationId);
                                warehouseId = loc?.default_warehouse_id || '';
                            }

                            set({
                                currentLocationId: locationId,
                                currentWarehouseId: warehouseId,
                                currentTerminalId: ''
                            });

                            // ⚡️ PERFORMANCE FIX: Fire-and-forget data fetching
                            // fetchInventory removed
                            state.fetchTerminals(locationId).catch(console.error);

                        } catch (e) { console.error("Error persisting location context", e); }
                    }

                    return { success: true };
                }

                return { success: false, error: 'Credenciales inválidas o sin conexión a datos' };
            },
            logout: () => {
                // Limpiar sesión en store
                set({
                    user: null,
                    currentTerminalId: '',
                    // Mantener location para no forzar re-selección
                });
                // Limpiar cookies de sesión
                try {
                    document.cookie = 'user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                    document.cookie = 'user_role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                } catch (e) { /* ignore */ }
            },

            // --- Data Sync ---
            isLoading: false,
            isInitialized: false,
            syncData: async (options = {}) => {
                const { force = false } = options;
                if (get().isInitialized && !force) {
                    console.log('🔄 Data already synced, skipping...');
                    return;
                }
                set({ isLoading: true });
                if (force) set({ isInitialized: false });

                try {
                    const currentStoreState = get();

                    // 1. Sync Offline Sales
                    try {
                        const { useOfflineSales } = await import('../../lib/store/offlineSales');
                        const { pendingSales, removeOfflineSale, updateOfflineSaleStatus } = useOfflineSales.getState();
                        const salesToSync = pendingSales.filter(s => s.syncStatus !== 'CONFLICT');

                        if (salesToSync.length > 0) {
                            console.log(`📡 Syncing ${salesToSync.length} offline sales...`);
                            const { createSaleSecure } = await import('../../actions/sales-v2');

                            for (const sale of salesToSync) {
                                try {
                                    const saleItems = sale.items.map(item => ({
                                        batch_id: item.batchId || '',
                                        quantity: item.quantity,
                                        price: item.price,
                                        stock: item.stock
                                    }));
                                    const result = await createSaleSecure({
                                        locationId: sale.locationId,
                                        terminalId: sale.terminalId,
                                        sessionId: sale.sessionId,
                                        userId: sale.userId,
                                        items: saleItems,
                                        paymentMethod: sale.paymentMethod,
                                        dteType: 'BOLETA'
                                    });

                                    if (result.success) {
                                        console.log(`✅ Sale ${sale.id} synced`);
                                        removeOfflineSale(sale.id);
                                    } else {
                                        const isStockError = result.error?.toLowerCase().includes('stock') || (result as any).stockErrors;
                                        updateOfflineSaleStatus(sale.id, isStockError ? 'CONFLICT' : 'ERROR', result.error || 'Unknown Error');
                                    }
                                } catch (e: any) {
                                    console.error(`❌ Sync error for sale ${sale.id}:`, e);
                                    updateOfflineSaleStatus(sale.id, 'ERROR', e.message);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('❌ Error in offline sales sync:', e);
                    }

                    // 2. Sync General Outbox
                    try {
                        const { processOutboxQueue } = await import('../../lib/sync-manager');
                        await processOutboxQueue();
                    } catch (e) {
                        console.error('❌ Error in outbox sync:', e);
                    }

                    // 3. Fetch Data (PHASE 1: CRITICAL DATA)
                    // Immediate data needed for UI skeletons (Auth, Locations, Suppliers)
                    const { TigerDataService } = await import('../../domain/services/TigerDataService');

                    const [employeesRes, suppliersRes, locationsRes, customers] = await Promise.all([
                        import('../../actions/sync-v2').then(async m => {
                            const res = await m.fetchEmployeesSecure();
                            if (!res.success && res.error === 'No autenticado') return m.getUsersForLoginSecure();
                            return res;
                        }),
                        import('../../actions/sync-v2').then(m => m.fetchSuppliersSecure()),
                        import('../../actions/sync-v2').then(m => m.fetchLocationsSecure()),
                        TigerDataService.fetchCustomers()
                    ]);

                    const employees = employeesRes.success ? (employeesRes.data || []) as unknown as EmployeeProfile[] : [];
                    const suppliers = suppliersRes.success ? suppliersRes.data || [] : [];
                    const locations = locationsRes.success ? locationsRes.data || [] : [];

                    // Update Location Store
                    if (locations.length > 0) useLocationStore.getState().setLocations(locations);

                    // Set Critical Data immediately to unblock UI
                    set({
                        employees,
                        suppliers,
                        customers: customers || [],
                        locations,
                        isLoading: false // ⚡️ UNBLOCK UI HERE
                    });

                    // 4. Fetch Data (PHASE 2: HEAVY DATA - BACKGROUND)
                    // Fire-and-forget for Inventory, Sales, and Movements
                    (async () => {
                        try {
                            const [inventory, sales, cashMovements, shipments, purchaseOrders] = await Promise.all([
                                currentStoreState.currentLocationId ? TigerDataService.fetchInventory(currentStoreState.currentLocationId) : Promise.resolve([]),
                                TigerDataService.fetchSalesHistory(currentStoreState.currentLocationId, undefined, undefined, currentStoreState.currentShift?.id),
                                TigerDataService.fetchCashMovements(),
                                TigerDataService.fetchShipments(currentStoreState.currentLocationId),
                                TigerDataService.fetchPurchaseOrders()
                            ]);

                            // Background Update
                            set({
                                inventory,
                                shipments: shipments || [],
                                purchaseOrders: purchaseOrders || [],
                                cashMovements: cashMovements || [],
                                salesHistory: [
                                    ...sales,
                                    ...currentStoreState.salesHistory.filter(s => s.is_synced === false && !sales.some(cloud => cloud.id === s.id))
                                ],
                                expenses: (cashMovements || []).filter(m => m.type === 'OUT' && ['SUPPLIES', 'SERVICES', 'SALARY_ADVANCE', 'OTHER'].includes(m.reason)).map(m => ({
                                    id: m.id,
                                    description: m.description,
                                    amount: m.amount,
                                    category: (m.reason === 'SUPPLIES' ? 'INSUMOS' : m.reason === 'SERVICES' ? 'SERVICIOS' : 'OTROS') as any,
                                    date: m.timestamp,
                                    is_deductible: false
                                }))
                            });

                            // Initialize Tiger Service Storage for Offline Simulation
                            TigerDataService.initializeStorage({
                                employees,
                                products: inventory,
                                sales,
                                cashMovements: cashMovements || [],
                                expenses: get().expenses
                            });

                            set({ isInitialized: true });
                            console.log('✅ Background Sync Complete');

                        } catch (bgError) {
                            console.error('❌ Background Sync Failed:', bgError);
                        }
                    })();

                } catch (error) {
                    console.error('❌ Sync failed:', error);
                    import('sonner').then(({ toast }) => toast.error('Error de Sincronización', { description: 'Usando datos locales.' }));
                    set({ isLoading: false }); // Ensure unblock on error
                }
            },

            // fetchInventory removed


            // --- Inventory ---
            locations: [], // Initialize locations
            inventory: [],
            setInventory: (inventory) => set({ inventory }),
            suppliers: [],
            supplierDocuments: [],
            purchaseOrders: [],
            reorderConfigs: [], // Intelligent ordering configurations
            updateStock: (batchId, quantity) => set((state) => ({
                inventory: state.inventory.map(item =>
                    item.id === batchId ? { ...item, stock_actual: item.stock_actual + quantity } : item
                )
            })),
            addStock: (batchId, quantity, expiry) => set((state) => ({
                inventory: state.inventory.map(item =>
                    item.id === batchId ? {
                        ...item,
                        stock_actual: item.stock_actual + quantity,
                        expiry_date: expiry || item.expiry_date
                    } : item
                )
            })),
            addNewProduct: (product) => set((state) => ({
                inventory: [...state.inventory, { ...product, id: `BATCH - ${Date.now()} ` }]
            })),
            transferStock: async (batchId, targetLocation, quantity) => {
                const state = get();
                const sourceItem = state.inventory.find(i => i.id === batchId);
                if (!sourceItem) {
                    import('sonner').then(({ toast }) => toast.error('Lote no encontrado'));
                    return;
                }

                const { executeTransferSecure } = await import('../../actions/wms-v2');

                const result = await executeTransferSecure({
                    originWarehouseId: sourceItem.location_id, // Assuming location_id is warehouse_id
                    targetWarehouseId: targetLocation,
                    items: [{
                        productId: sourceItem.sku, // WMS looks up by Lot ID primarily, SKU/Product ID is secondary verification/lookup
                        quantity,
                        lotId: batchId
                    }],
                    userId: state.user?.id || 'SYSTEM'
                });

                if (result.success) {
                    import('sonner').then(({ toast }) => toast.success('Traspaso exitoso'));
                    // await get().fetchInventory(state.currentLocationId, state.currentWarehouseId);
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error en traspaso: ' + result.error));
                }
            },
            addPurchaseOrder: (po) => set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] })),
            receivePurchaseOrder: async (poId, receivedItems, destinationLocationId) => {
                const state = get();
                const { receivePurchaseOrderSecure: receivePOAction } = await import('../../actions/supply-v2');

                const userId = state.user?.id || 'SYSTEM';
                const result = await receivePOAction({
                    purchaseOrderId: poId,
                    receivedItems: receivedItems.map(i => ({
                        sku: i.sku,
                        quantity: i.receivedQty,
                        lotNumber: i.lotNumber,
                        expiryDate: i.expiryDate
                    }))
                }, userId);

                if (result.success) {
                    import('sonner').then(({ toast }) => toast.success('Recepción de Orden exitosa'));
                    // await get().fetchInventory(state.currentLocationId, state.currentWarehouseId);

                    // Update local PO list status optimistically or refetch
                    set((s) => ({
                        purchaseOrders: s.purchaseOrders.map(p => p.id === poId ? { ...p, status: 'RECEIVED' } : p)
                    }));

                } else {
                    import('sonner').then(({ toast }) => toast.error('Error al recibir orden: ' + result.error));
                }
            },

            cancelPurchaseOrder: (poId) => set((state) => ({
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === poId ? { ...po, status: 'CANCELLED' as any } : po
                )
            })),
            removePurchaseOrder: (poId) => set((state) => ({
                purchaseOrders: state.purchaseOrders.filter(po => po.id !== poId)
            })),
            updatePurchaseOrder: (id, data) => set((state) => ({
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === id ? { ...po, ...data } : po
                )
            })),

            // --- SRM Actions ---
            addSupplier: async (supplierData) => {
                const data = supplierData as any;
                const { createSupplierSecure } = await import('../../actions/suppliers-v2');
                const contacts = Array.isArray(data.contacts)
                    ? data.contacts
                        .filter((c: any) => c && (c.name || c.email || c.phone))
                        .map((c: any) => ({
                            ...c,
                            email: c.email || undefined,
                            phone: c.phone || undefined,
                            role: c.role || undefined,
                            is_primary: c.is_primary ?? false
                        }))
                    : [];
                const payload = {
                    rut: data.rut,
                    businessName: data.business_name ?? data.businessName,
                    fantasyName: data.fantasy_name ?? data.fantasyName,
                    contactEmail: data.contact_email ?? data.contactEmail,
                    phone1: data.phone_1 ?? data.phone1,
                    phone2: data.phone_2 ?? data.phone2,
                    address: data.address,
                    city: data.city,
                    region: data.region,
                    commune: data.commune,
                    website: data.website,
                    emailOrders: data.email_orders ?? data.emailOrders,
                    emailBilling: data.email_billing ?? data.emailBilling,
                    sector: data.sector,
                    paymentTerms: data.payment_terms ?? data.paymentTerms,
                    leadTimeDays: data.lead_time_days ?? data.leadTimeDays,
                    bankAccount: data.bank_account ?? data.bankAccount,
                    contacts,
                    brands: data.brands
                };
                const result = await createSupplierSecure(payload as any);
                if (result.success && result.data?.supplierId) {
                    set((state) => ({
                        suppliers: [...state.suppliers, { ...supplierData, id: result.data!.supplierId } as Supplier]
                    }));
                    import('sonner').then(({ toast }) => toast.success('Proveedor guardado correctamente'));
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error al guardar proveedor'));
                }
            },
            updateSupplier: async (id, supplierData) => {
                const data = supplierData as any;
                const { updateSupplierSecure } = await import('../../actions/suppliers-v2');
                const contacts = Array.isArray(data.contacts)
                    ? data.contacts
                        .filter((c: any) => c && (c.name || c.email || c.phone))
                        .map((c: any) => ({
                            ...c,
                            email: c.email || undefined,
                            phone: c.phone || undefined,
                            role: c.role || undefined,
                            is_primary: c.is_primary ?? false
                        }))
                    : [];
                const payload = {
                    supplierId: id,
                    rut: data.rut,
                    businessName: data.business_name ?? data.businessName,
                    fantasyName: data.fantasy_name ?? data.fantasyName,
                    contactEmail: data.contact_email ?? data.contactEmail,
                    phone1: data.phone_1 ?? data.phone1,
                    phone2: data.phone_2 ?? data.phone2,
                    address: data.address,
                    city: data.city,
                    region: data.region,
                    commune: data.commune,
                    website: data.website,
                    emailOrders: data.email_orders ?? data.emailOrders,
                    emailBilling: data.email_billing ?? data.emailBilling,
                    sector: data.sector,
                    paymentTerms: data.payment_terms ?? data.paymentTerms,
                    leadTimeDays: data.lead_time_days ?? data.leadTimeDays,
                    bankAccount: data.bank_account ?? data.bankAccount,
                    contacts,
                    brands: data.brands
                };
                const result = await updateSupplierSecure(payload as any);
                if (result.success) {
                    set((state) => ({
                        suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...supplierData } : s)
                    }));
                    import('sonner').then(({ toast }) => toast.success('Proveedor actualizado correctamente'));
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error al actualizar proveedor'));
                }
            },
            addSupplierDocument: (docData) => set((state) => ({
                supplierDocuments: [...state.supplierDocuments, { ...docData, id: `DOC - ${Date.now()} ` }]
            })),

            // --- POS ---
            cart: [],
            currentCustomer: null,
            // Printer Config
            printerConfig: {
                auto_print_sale: true,
                auto_print_cash: true,
                auto_print_queue: true,
                header_text: 'FARMACIAS VALLENAR SUIT',
                footer_text: 'Gracias por su preferencia'
            },
            updatePrinterConfig: (config) => set((state) => ({
                printerConfig: { ...state.printerConfig, ...config }
            })),

            // --- Loyalty ---
            loyaltyConfig: {
                earn_rate: 100, // $100 = 1 point
                burn_rate: 1,   // 1 point = $1
                min_points_to_redeem: 100
            },
            updateLoyaltyConfig: (config) => set((state) => ({
                loyaltyConfig: { ...state.loyaltyConfig, ...config }
            })),
            calculatePointsEarned: (amount) => {
                const { loyaltyConfig } = get();
                return Math.floor(amount / loyaltyConfig.earn_rate);
            },
            calculateDiscountValue: (points) => {
                const { loyaltyConfig } = get();
                return points * loyaltyConfig.burn_rate;
            },

            // Actions Implementation
            setCustomer: (customer) => set({ currentCustomer: customer }),
            // --- ACTIONS ---
            updateProduct: (id: string, data: Partial<InventoryBatch>) => set((state) => ({
                inventory: state.inventory.map(item =>
                    item.id === id ? { ...item, ...data } : item
                )
            })),

            createProduct: (product) => {
                const newProduct: InventoryBatch = {
                    ...product,
                    id: `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                };
                set((state) => ({
                    inventory: [...state.inventory, newProduct]
                }));
                // TODO: Sync to Tiger Cloud via src/lib/db.ts
                return newProduct;
            },

            deleteProduct: (id) => {
                set((state) => ({
                    inventory: state.inventory.filter(item => item.id !== id)
                }));
                // TODO: Delete from Tiger Cloud via src/lib/db.ts
            },

            getProductBySKU: (sku) => {
                return get().inventory.find(item => item.sku === sku);
            },


            updateBatchDetails: (productId, batchId, data) => {
                set((state) => ({
                    inventory: state.inventory.map((item) => {
                        // In this simplified model, items ARE batches.
                        // So we just find the item by ID (which acts as batch ID here) and update it.
                        // In a more complex model with Product -> Batches relation, we would drill down.
                        if (item.id === batchId) {
                            return { ...item, ...data };
                        }
                        return item;
                    })
                }));
            },

            registerStockMovement: (batchId, quantity, type) => {
                set((state) => {
                    const updatedInventory = state.inventory.map(item => {
                        if (item.id === batchId) {
                            let newStock = item.stock_actual;

                            if (type === 'SALE' || type === 'TRANSFER_OUT' || type === 'ADJUSTMENT' && quantity < 0) {
                                newStock -= Math.abs(quantity);
                            } else if (type === 'RECEIPT' || type === 'TRANSFER_IN' || type === 'ADJUSTMENT' && quantity > 0) {
                                newStock += Math.abs(quantity);
                            }

                            // Sync with TigerDataService (Fire and forget for now, but ideally await)
                            import('../../domain/services/TigerDataService').then(({ TigerDataService }) => {
                                TigerDataService.updateInventoryStock(
                                    item.id,
                                    Math.abs(quantity),
                                    (type === 'SALE' || type === 'TRANSFER_OUT' || (type === 'ADJUSTMENT' && quantity < 0)) ? 'SUBTRACT' : 'ADD'
                                ).catch(console.error);
                            });

                            return { ...item, stock_actual: newStock };
                        }
                        return item;
                    });
                    return { inventory: updatedInventory };
                });
            },
            clearInventory: () => set({ inventory: [] }),

            // WMS Helpers
            getInventoryByLocation: (locationId) => {
                const state = get();
                return state.inventory.filter(batch => batch.location_id === locationId);
            },
            getAvailableStockAtLocation: (sku, locationId) => {
                const state = get();
                return state.inventory
                    .filter(batch => batch.sku === sku && batch.location_id === locationId)
                    .reduce((sum, batch) => sum + batch.stock_actual, 0);
            },
            addToCart: (item, quantity = 1) => set((state) => {
                const existingItem = state.cart.find(i => i.id === item.id);
                if (existingItem) {
                    return {
                        cart: state.cart.map(i =>
                            i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
                        )
                    };
                }
                const newItem: CartItem = {
                    id: item.id,
                    sku: item.sku,
                    name: item.name,
                    price: item.price,
                    quantity: quantity,
                    allows_commission: item.allows_commission,
                    active_ingredients: item.active_ingredients,
                    cost_price: item.cost_price || 0
                };
                return { cart: [...state.cart, newItem] };
            }),
            updateCartItemQuantity: (sku, quantity) => set((state) => ({
                cart: state.cart.map(i =>
                    i.sku === sku ? { ...i, quantity: Math.max(1, quantity) } : i
                )
            })),
            // --- Importación Masiva ---
            importInventory: (items: InventoryBatch[]) => {
                set((state) => {
                    const newInventory = [...state.inventory];

                    items.forEach(newItem => {
                        const existingIndex = newInventory.findIndex(i => i.sku === newItem.sku);

                        if (existingIndex >= 0) {
                            // MERGE: Update existing item
                            const existingItem = newInventory[existingIndex];
                            newInventory[existingIndex] = {
                                ...existingItem,
                                stock_actual: existingItem.stock_actual + newItem.stock_actual, // Add stock
                                price: newItem.price_sell_box || newItem.price, // Update price
                                price_sell_box: newItem.price_sell_box,
                                cost_net: newItem.cost_net || existingItem.cost_net, // Update cost if provided
                                location_id: newItem.location_id || existingItem.location_id
                            };
                        } else {
                            // ADD: New item
                            newInventory.push(newItem);
                        }
                    });

                    return { inventory: newInventory };
                });
            },

            // --- Queue Management ---
            // Moved to bottom with other Queue actions

            addManualItem: (item) => set((state) => ({
                cart: [...state.cart, {
                    id: 'MANUAL-' + Date.now(),
                    batch_id: 'MANUAL',
                    sku: item.sku || 'MANUAL-SKU',
                    name: item.description,
                    price: item.price,
                    quantity: item.quantity,
                    allows_commission: true,
                    active_ingredients: item.active_ingredients || [],
                    is_fractional: item.is_fractional,
                    original_name: item.original_name
                }]
            })),
            removeFromCart: (sku) => set((state) => ({
                cart: state.cart.filter(i => i.sku !== sku)
            })),
            clearCart: () => set({ cart: [] }),
            processSale: async (paymentMethod, customer) => {
                const state = get();

                if (!state.currentLocationId || !state.currentTerminalId) {
                    import('sonner').then(({ toast }) => {
                        toast.error('⚠️ Caja Cerrada: Debe abrir caja y seleccionar sucursal antes de vender.');
                    });
                    return false;
                }

                try {
                    // Get session_id from currentShift
                    const sessionId = state.currentShift?.id;

                    // 🔍 DEBUG: Log session info to diagnose the issue
                    console.log('🔍 [processSale] DEBUG:', JSON.stringify({
                        sessionId,
                        terminalId: state.currentTerminalId,
                        locationId: state.currentLocationId,
                        shiftExists: !!state.currentShift,
                        shiftData: state.currentShift ? {
                            id: state.currentShift.id,
                            terminal_id: state.currentShift.terminal_id,
                            status: state.currentShift.status
                        } : null
                    }, null, 2));

                    if (!sessionId) {
                        import('sonner').then(({ toast }) => {
                            toast.error(`⚠️ Sin sesión activa (${sessionId}). Debe abrir caja antes de vender.`);
                        });
                        return false;
                    }

                    // 🔍 DEBUG: Show the session ID in the console even if we have one, to check if it's the right one
                    if (!sessionId.includes('-')) {
                        console.warn('⚠️ WARNING: Session ID does not look like a UUID:', sessionId);
                        import('sonner').then(({ toast }) => {
                            toast.error(`⚠️ Error de sesión: ID inválido (${sessionId})`);
                        });
                        return false;
                    }

                    // 1. Create sale transaction object
                    const saleTransaction: SaleTransaction = {
                        id: `SALE - ${Date.now()} -${Math.floor(Math.random() * 1000)} `,
                        status: 'COMPLETED',
                        timestamp: Date.now(),
                        items: state.cart.map(item => ({
                            batch_id: item.batch_id || item.id, // CartItem uses 'id' as batch reference
                            sku: item.sku,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                            allows_commission: item.allows_commission || false,
                            active_ingredients: item.active_ingredients,
                            cost_price: item.cost_price || 0
                        })),
                        total: state.cart.reduce((a, b) => a + b.price * b.quantity, 0),
                        payment_method: paymentMethod as any,
                        seller_id: state.user?.id || 'UNKNOWN',
                        customer: customer || undefined,
                        branch_id: state.currentLocationId,
                        terminal_id: state.currentTerminalId,
                        session_id: sessionId // ✅ Added for createSaleSecure validation
                    };

                    // 2. CRITICAL: Save to Tiger Data BEFORE clearing cart
                    // const { TigerDataService } = await import('../../domain/services/TigerDataService'); // REMOVED
                    const result = await TigerDataService.saveSaleTransaction(
                        saleTransaction,
                        state.currentLocationId,
                        state.currentTerminalId
                    );

                    if (!result.success) {
                        console.warn('⚠️ Failed to save sale to Tiger Data (Offline Mode):', result.error);

                        // OFFLINE MODE: Mark as unsynced but keep in local history
                        saleTransaction.is_synced = false;

                        import('sonner').then(({ toast }) => {
                            toast.warning('Error al guardar venta (Guardado local)', {
                                description: result.error || 'Se sincronizará cuando recupere internet.',
                                duration: 5000
                            });
                        });
                        // Allow to proceed to local update
                    } else {
                        saleTransaction.is_synced = true;
                    }

                    // ✅ Sale saved (either Cloud or Local)

                    // 3. Update local inventory (deduct stock)
                    const newInventory = state.inventory.map(item => {
                        const cartItem = state.cart.find(c => c.sku === item.sku);
                        if (cartItem) {
                            return { ...item, stock_actual: item.stock_actual - cartItem.quantity };
                        }
                        return item;
                    });

                    // 4. Update customer points if applicable
                    if (customer) {
                        const pointsEarned = state.calculatePointsEarned(saleTransaction.total);
                        state.updateCustomer(customer.id, {
                            totalPoints: customer.totalPoints + pointsEarned,
                            lastVisit: Date.now(),
                            total_spent: (customer.total_spent || 0) + saleTransaction.total
                        });
                    }

                    // 5. Update local state (clear cart and add to history)
                    set({
                        inventory: newInventory,
                        cart: [],
                        currentCustomer: null,
                        salesHistory: [...state.salesHistory, saleTransaction]
                    });

                    return true;
                } catch (error) {
                    console.error('❌ Error processing sale:', error);
                    // Don't clear cart on error - allow retry
                    return false;
                }
            },

            // --- CRM ---
            customers: [], // Start empty, load from DB via fetchCustomers

            fetchCustomers: async (searchTerm?: string) => {
                try {
                    const { getCustomersSecure } = await import('../../actions/customers-v2');
                    const result = await getCustomersSecure({ searchTerm, pageSize: 100 });
                    if (result.success && result.data?.customers) {
                        // Map DB schema to local Customer type
                        const mappedCustomers: Customer[] = result.data.customers.map((c: any) => ({
                            id: c.id,
                            rut: c.rut,
                            fullName: c.name, // DB uses 'name', local uses 'fullName'
                            name: c.name,
                            phone: c.phone || '',
                            email: c.email || '',
                            totalPoints: c.loyalty_points || 0,
                            registrationSource: 'POS' as const, // Cast to valid type
                            lastVisit: c.last_visit ? new Date(c.last_visit).getTime() : Date.now(),
                            age: 0,
                            health_tags: c.health_tags || [],
                            total_spent: 0,
                            tags: c.tags || [],
                            status: c.status || 'ACTIVE'
                        }));
                        set({ customers: mappedCustomers });
                    }
                } catch (error) {
                    console.error('[Store] Failed to fetch customers:', error);
                }
            },

            addCustomer: async (data) => {
                // 1. Offline Check
                const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

                try {
                    let result = null;

                    // 2. Try Online if possible
                    if (!isOffline) {
                        const { createCustomerSecure } = await import('../../actions/customers-v2');
                        result = await createCustomerSecure({
                            rut: data.rut,
                            fullName: data.fullName,
                            phone: data.phone || undefined,
                            email: data.email || undefined,
                            registrationSource: data.registrationSource || 'POS',
                            tags: [],
                            healthTags: []
                        });
                    }

                    // 3. Handle Success
                    if (result && result.success && result.data?.id) {
                        const newCustomer: Customer = {
                            ...data,
                            id: result.data.id,
                            totalPoints: 0,
                            lastVisit: Date.now(),
                            health_tags: [],
                            name: data.fullName,
                            age: 0,
                            total_spent: 0,
                            tags: [],
                            status: 'ACTIVE'
                        };
                        set((state) => ({
                            customers: [...state.customers, newCustomer],
                            currentCustomer: newCustomer
                        }));
                        return newCustomer;
                    }

                    // 4. Handle Offline / Fallback
                    // If manually offline OR network request failed (result null or specific error)
                    if (isOffline || !result || result.error?.includes('Network') || result.error?.includes('fetch')) {
                        console.log('⚠️ Falling back to Offline Customer Creation');
                        const tempId = `OFFLINE-CUST-${Date.now()}`;
                        const newCustomer: Customer = {
                            ...data,
                            id: tempId,
                            totalPoints: 0,
                            lastVisit: Date.now(),
                            health_tags: [],
                            name: data.fullName,
                            age: 0,
                            total_spent: 0,
                            tags: [],
                            status: 'ACTIVE' // Or 'PENDING' if we had that status
                        };

                        // Add to Outbox
                        const { useOutboxStore } = await import('../../lib/store/outboxStore');
                        useOutboxStore.getState().addToOutbox(
                            'CLIENT_CREATE',
                            {
                                ...data,
                                registrationSource: data.registrationSource || 'POS'
                            }
                        );

                        // Add to Local State
                        set((state) => ({
                            customers: [...state.customers, newCustomer],
                            currentCustomer: newCustomer
                        }));

                        import('sonner').then(({ toast }) => toast.warning('Cliente guardado localmente', {
                            description: 'Se sincronizará cuando recupere conexión.'
                        }));

                        return newCustomer;
                    } else {
                        // Real validation error from server
                        import('sonner').then(({ toast }) => toast.error(result.error || 'Error al registrar cliente'));
                        return null;
                    }

                } catch (error: any) {
                    console.error('[Store] addCustomer error:', error);
                    // Fallback on Exception (Network Error usually)
                    const tempId = `OFFLINE-CUST-${Date.now()}`;
                    const newCustomer: Customer = {
                        ...data,
                        id: tempId,
                        totalPoints: 0,
                        lastVisit: Date.now(),
                        health_tags: [],
                        name: data.fullName,
                        age: 0,
                        total_spent: 0,
                        tags: [],
                        status: 'ACTIVE'
                    };

                    const { useOutboxStore } = await import('../../lib/store/outboxStore');
                    useOutboxStore.getState().addToOutbox(
                        'CLIENT_CREATE',
                        {
                            ...data,
                            registrationSource: data.registrationSource || 'POS'
                        }
                    );

                    set((state) => ({
                        customers: [...state.customers, newCustomer],
                        currentCustomer: newCustomer
                    }));

                    import('sonner').then(({ toast }) => toast.warning('Cliente guardado localmente (Offline)', {
                        description: 'Se sincronizará automáticamente.'
                    }));
                    return newCustomer;
                }
            },
            updateCustomer: (id, data) => set((state) => ({
                customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c)
            })),
            deleteCustomer: (id) => set((state) => ({
                customers: state.customers.map(c => c.id === id ? { ...c, status: 'BANNED' as const } : c)
            })),
            redeemPoints: (customerId, points) => {
                const state = get();
                const customer = state.customers.find(c => c.id === customerId);

                if (!customer) {
                    import('sonner').then(({ toast }) => {
                        toast.error('Cliente no encontrado');
                    });
                    return false;
                }

                if (points < state.loyaltyConfig.min_points_to_redeem) {
                    import('sonner').then(({ toast }) => {
                        toast.error(`Mínimo ${state.loyaltyConfig.min_points_to_redeem} puntos requeridos`);
                    });
                    return false;
                }

                if (customer.totalPoints < points) {
                    import('sonner').then(({ toast }) => {
                        toast.error('Puntos insuficientes');
                    });
                    return false;
                }

                // Deduct points
                state.updateCustomer(customerId, {
                    totalPoints: customer.totalPoints - points
                });

                return true;
            },

            // --- BI & Reports ---
            salesHistory: [],
            expenses: [],
            addExpense: (expense) => set((state) => ({
                expenses: [...state.expenses, { ...expense, id: `EXP - ${Date.now()} ` }]
            })),

            // --- Marketing ---
            promotions: [],
            giftCards: [],
            loyaltyRewards: [
                { id: 'REW-1', name: 'Canje Shampoo', points_cost: 5000, description: 'Shampoo 400ml' },
                { id: 'REW-2', name: 'Descuento $5.000', points_cost: 4000, description: 'En total de compra' }
            ],
            addPromotion: (promo) => set((state) => ({ promotions: [...state.promotions, promo] })),
            togglePromotion: (id) => set((state) => ({
                promotions: state.promotions.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p)
            })),
            createGiftCard: (amount) => {
                const code = `GIFT - ${Math.floor(1000 + Math.random() * 9000)} -${new Date().getFullYear()} `;
                const newCard: GiftCard = {
                    code,
                    balance: amount,
                    initial_balance: amount,
                    status: 'ACTIVE',
                    created_at: Date.now()
                };
                set((state) => ({ giftCards: [...state.giftCards, newCard] }));
                return newCard;
            },
            redeemGiftCard: (code, amount) => {
                const state = get();
                const card = state.giftCards.find(c => c.code === code);
                if (!card || card.status !== 'ACTIVE' || card.balance < amount) return false;

                const newBalance = card.balance - amount;
                set((state) => ({
                    giftCards: state.giftCards.map(c =>
                        c.code === code ? {
                            ...c,
                            balance: newBalance,
                            status: newBalance === 0 ? 'REDEEMED' : 'ACTIVE'
                        } : c
                    )
                }));
                return true;
            },
            getGiftCard: (code) => get().giftCards.find(c => c.code === code),


            // --- Quotes ---
            quotes: [],
            createQuote: async (customer) => {
                const state = get();

                const { createQuoteSecure: createQuoteAction } = await import('../../actions/quotes-v2');
                const result = await createQuoteAction({
                    customerId: customer?.id,
                    customerName: customer?.name,
                    customerPhone: customer?.phone,
                    customerEmail: customer?.email || '',
                    items: state.cart.map(item => ({
                        productId: item.id,
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        discount: 0
                    })),
                    locationId: state.currentLocationId,
                    validDays: 7
                });

                if (result.success && result.quoteId) {
                    import('sonner').then(({ toast }) => {
                        toast.success(`Cotización guardada: ${result.quoteCode || result.quoteId}`);
                    });
                    set({ cart: [], currentCustomer: null });
                    return { id: result.quoteId, code: result.quoteCode } as any;
                } else {
                    import('sonner').then(({ toast }) => {
                        toast.error('Error al guardar cotización');
                    });
                    return null; // Handle error appropriately
                }
            },
            retrieveQuote: async (quoteCode) => {
                const state = get();
                const { retrieveQuoteSecure: retrieveQuoteAction } = await import('../../actions/quotes-v2');

                const result = await retrieveQuoteAction(quoteCode);

                if (result.success && result.data) {
                    const quote = result.data;

                    // Convert QuoteItems to CartItems
                    const cartItems: CartItem[] = quote.items.map((item: any) => ({
                        id: item.product_id || item.sku,
                        sku: item.sku,
                        name: item.name,
                        price: item.unit_price,
                        quantity: item.quantity,
                    }));

                    set({
                        cart: cartItems,
                        currentCustomer: state.customers.find(c => c.name === quote.customer_name) || null
                    });

                    import('sonner').then(({ toast }) => {
                        toast.success(`Cotización cargada: ${quote.id}`);
                    });
                    return true;
                } else {
                    import('sonner').then(({ toast }) => {
                        toast.error(result.error || 'Cotización no encontrada');
                    });
                    return false;
                }
            },


            // --- Cash Management & Shifts ---
            currentShift: null,
            dailyShifts: [],
            fetchLocations: async () => {
                try {
                    const { getLocationsSecure } = await import('../../actions/locations-v2');
                    const result = await getLocationsSecure();
                    if (result.success && result.data) {
                        set({ locations: result.data });
                    }
                } catch (error) {
                    console.error('Failed to fetch locations', error);
                }
            },

            terminals: [],
            fetchTerminals: async (locationId) => {
                set({ isLoading: true });
                try {
                    // Logic to fetch terminals for a specific location
                    // Can reuse action or direct API
                    const { getTerminalsByLocationSecure } = await import('../../actions/terminals-v2');
                    const res = await getTerminalsByLocationSecure(locationId);
                    if (res.success && res.data) {
                        console.log('✅ Terminals set in store for Location', locationId, 'Count:', res.data.length, res.data);
                        set({ terminals: res.data });
                    } else {
                        console.warn('⚠️ Fetch Terminals yielded no data or error for', locationId);
                        set({ terminals: [] });
                    }
                } catch (e) {
                    console.error('Failed to fetch terminals', e);
                } finally {
                    set({ isLoading: false });
                }
            },

            addTerminal: async (terminal, adminPin) => {
                // const { createTerminalSecure } = await import('../../actions/network-v2');
                // Optimistic Update (Temporary ID)
                const tempId = `TEMP-${Date.now()}`;
                set((state) => ({
                    terminals: [...state.terminals, { ...terminal, id: tempId, status: 'CLOSED' }]
                }));

                try {
                    const res = await createTerminalSecure({
                        name: terminal.name,
                        module_number: terminal.module_number,
                        locationId: terminal.location_id,
                        allowedUsers: terminal.allowed_users,
                    }, adminPin);

                    if (res.success && res.terminalId) {
                        // Replace Temp ID with Real ID
                        set((state) => ({
                            terminals: state.terminals.map(t => t.id === tempId ? { ...t, id: res.terminalId! } : t)
                        }));
                        import('sonner').then(({ toast }) => toast.success('Caja creada correctamente'));
                    } else {
                        // Rollback
                        set((state) => ({
                            terminals: state.terminals.filter(t => t.id !== tempId)
                        }));
                        import('sonner').then(({ toast }) => toast.error('Error al crear caja: ' + res.error));
                    }
                } catch (error) {
                    set((state) => ({
                        terminals: state.terminals.filter(t => t.id !== tempId)
                    }));
                    console.error(error);
                }
            },
            deleteTerminal: async (id, adminPin) => {
                // const { deleteTerminalSecure } = await import('../../actions/network-v2');

                // Optimistic Update
                const previousTerminals = get().terminals;
                set((state) => ({
                    terminals: state.terminals.filter(t => t.id !== id)
                }));

                try {
                    const res = await deleteTerminalSecure(id, adminPin);
                    if (!res.success) {
                        // Rollback
                        set({ terminals: previousTerminals });
                        import('sonner').then(({ toast }) => toast.error('Error al eliminar caja: ' + res.error));
                    } else {
                        import('sonner').then(({ toast }) => toast.success('Caja eliminada correctamente'));
                    }
                } catch (error) {
                    console.error(error);
                    set({ terminals: previousTerminals });
                }
            },
            forceCloseTerminal: async (id) => {
                // const { forceCloseTerminalAtomic } = await import('../../actions/terminals-v2');
                const currentUser = get().user;

                // Optimistic Update
                set((state) => ({
                    terminals: state.terminals.map(t => t.id === id ? { ...t, status: 'CLOSED', current_cashier_id: undefined } : t)
                }));

                try {
                    // Force close with 0 cash and admin comment using ATOMIC Implementation
                    const res = await forceCloseTerminalShift(id, currentUser?.id || 'ADMIN_FORCE', 'Cierre Administrativo Forzado');

                    if (!res.success) {
                        import('sonner').then(({ toast }) => toast.error('Error al forzar cierre: ' + res.error));
                        // Re-fetch to sync true state
                        get().fetchTerminals(get().currentLocationId || get().terminals.find(t => t.id === id)?.location_id || '');
                    } else {
                        import('sonner').then(({ toast }) => toast.success('Caja cerrada forzosamente'));
                    }
                } catch (error) {
                    console.error(error);
                    import('sonner').then(({ toast }) => toast.error('Error de conexión'));
                }
            },
            updateTerminal: async (id, updates, adminPin) => {
                // const { updateTerminalSecure } = await import('../../actions/terminals-v2');

                // Optimistic Update
                set((state) => ({
                    terminals: state.terminals.map(t => t.id === id ? { ...t, ...updates } : t)
                }));

                try {
                    const res = await updateTerminalSecure({
                        terminalId: id,
                        name: updates.name,
                        module_number: updates.module_number
                    }, adminPin);

                    if (!res.success) {
                        // Rollback (requires fetching previous state, or just alerting)
                        import('sonner').then(({ toast }) => toast.error('Error al actualizar caja: ' + res.error));
                        // Ideally revert optimistic update here
                    } else {
                        import('sonner').then(({ toast }) => toast.success('Caja actualizada'));
                    }
                } catch (error) {
                    console.error(error);
                }
            },
            cashMovements: [],

            // openShift: Actualiza el estado local después de que el modal ya abrió el turno en el servidor
            openShift: (initialAmount, userId, authorizedBy, terminalId, locationId, sessionId) => {
                const state = get();

                // Usar terminalId pasado como parámetro
                const effectiveTerminalId = terminalId || state.currentTerminalId;
                const effectiveLocationId = locationId || state.currentLocationId;

                if (!effectiveTerminalId) {
                    import('sonner').then(({ toast }) => toast.error('No hay caja seleccionada'));
                    return;
                }

                // 🔧 FIX: Usar sessionId pasado directamente, fallback a localStorage solo si no se pasa
                const effectiveSessionId = sessionId || localStorage.getItem('pos_session_id') || `shift_${Date.now()}`;
                const newShift: Shift = {
                    id: effectiveSessionId,
                    terminal_id: effectiveTerminalId,
                    start_time: Date.now(),
                    opening_amount: initialAmount,
                    status: 'ACTIVE',
                    user_id: userId,
                    authorized_by: authorizedBy || userId
                };

                const updatedTerminals = state.terminals.map(t =>
                    t.id === effectiveTerminalId ? { ...t, status: 'OPEN' as const, operator_id: userId } : t
                );

                // Actualizar estado
                set({
                    currentTerminalId: effectiveTerminalId,
                    currentLocationId: effectiveLocationId,
                    currentShift: newShift,
                    terminals: updatedTerminals
                });
            },

            resumeShift: (shift) => {
                // Persist Session ID for Concurrency Check
                try {
                    localStorage.setItem('pos_session_id', shift.id);
                } catch (e) {
                    console.error('Failed to persist session ID', e);
                }

                set((state) => ({
                    currentShift: { ...shift, status: 'ACTIVE' },
                    terminals: state.terminals.map(t => t.id === shift.terminal_id ? { ...t, status: 'OPEN' as const } : t),
                    currentTerminalId: shift.terminal_id
                }));
                import('sonner').then(({ toast }) => toast.success('Turno reanudado'));
            },

            logoutShift: () => {
                try {
                    localStorage.removeItem('pos_session_id');
                } catch (e) { }

                set((state) => ({
                    currentShift: null,
                    cart: [],
                    currentCustomer: null
                }));
            },

            closeShift: async (finalAmount, authorizedBy) => {
                const state = get();
                if (!state.currentShift) return;

                const metrics = state.getShiftMetrics();
                const difference = finalAmount - metrics.expectedCash;

                // 🔒 Security: Audit Log for Missing Cash
                if (difference < 0) {
                    try {
                        const { logAuditEvent } = await import('../../actions/audit-v2');
                        await logAuditEvent({
                            actionCategory: 'CASH',
                            actionType: 'CASH_DIFFERENCE',
                            actionStatus: 'SUCCESS',
                            userId: authorizedBy,
                            resourceType: 'SHIFT',
                            resourceId: state.currentShift.id,
                            newValues: {
                                shift_id: state.currentShift.id,
                                difference,
                                expected: metrics.expectedCash,
                                actual: finalAmount
                            }
                        });
                    } catch (e) {
                        console.error('Failed to log cash difference', e);
                    }
                }

                const closedShift: Shift = {
                    ...state.currentShift,
                    end_time: Date.now(),
                    status: 'CLOSED',
                    closing_amount: finalAmount,
                    difference: difference
                };

                // Update terminals
                const updatedTerminals = state.terminals.map(t =>
                    t.id === state.currentShift!.terminal_id ? { ...t, status: 'CLOSED' as const } : t
                );

                // Remove Session ID
                try {
                    localStorage.removeItem('pos_session_id');
                } catch (e) {
                    console.error('Failed to remove session ID', e);
                }

                set({
                    currentShift: null, // Reset current shift
                    dailyShifts: [...state.dailyShifts, closedShift], // Archive it
                    terminals: updatedTerminals,
                    cart: [], // Clear cart
                    currentCustomer: null // Clear customer
                });

                // Optional: Sync closed shift to Server Action if needed here
            },
            updateOpeningAmount: (newAmount) => set((state) => {
                if (!state.currentShift) return state;
                return {
                    currentShift: {
                        ...state.currentShift,
                        opening_amount: newAmount
                    }
                };
            }),
            registerCashMovement: (movement) => set((state) => {
                if (!state.currentShift) return state;
                const newMovement: CashMovement = {
                    id: `MOV - ${Date.now()} `,
                    shift_id: state.currentShift.id,
                    timestamp: Date.now(),
                    user_id: state.user?.id || 'UNKNOWN',
                    ...movement
                };
                return { cashMovements: [...state.cashMovements, newMovement] };
            }),
            getShiftMetrics: () => {
                const state = get();
                if (!state.currentShift) return {
                    totalSales: 0, cashSales: 0, cardSales: 0, transferSales: 0, initialFund: 0, totalOutflows: 0, expectedCash: 0
                };

                // Filter sales within the current shift
                const shiftSales = state.salesHistory.filter(s => s.timestamp >= state.currentShift!.start_time && (!state.currentShift!.end_time || s.timestamp <= state.currentShift!.end_time));

                const totalSales = shiftSales.reduce((sum, s) => sum + s.total, 0);
                const cashSalesList = shiftSales.filter(s => s.payment_method === 'CASH');
                const cardSalesList = shiftSales.filter(s => s.payment_method === 'DEBIT' || s.payment_method === 'CREDIT');
                const transferSalesList = shiftSales.filter(s => s.payment_method === 'TRANSFER');

                const cashSales = cashSalesList.reduce((sum, s) => sum + s.total, 0);
                const cardSales = cardSalesList.reduce((sum, s) => sum + s.total, 0);
                const transferSales = transferSalesList.reduce((sum, s) => sum + s.total, 0);

                const initialFund = state.currentShift.opening_amount;

                const shiftMovements = state.cashMovements.filter(m => m.shift_id === state.currentShift!.id);
                const totalOutflows = shiftMovements
                    .filter(m => ['OUT', 'WITHDRAWAL', 'EXPENSE'].includes(m.type))
                    .reduce((sum, m) => sum + m.amount, 0);

                const totalInflows = shiftMovements
                    .filter(m => ['IN', 'EXTRA_INCOME'].includes(m.type))
                    .reduce((sum, m) => sum + m.amount, 0);

                const expectedCash = initialFund + cashSales + totalInflows - totalOutflows;

                return {
                    totalSales,
                    cashSales,
                    cardSales,
                    transferSales,
                    initialFund,
                    totalOutflows,
                    expectedCash,
                    // Detailed Lists
                    cashSalesList,
                    cardSalesList,
                    transferSalesList,
                    // Counts
                    cardCount: cardSalesList.length,
                    transferCount: transferSalesList.length
                };
            },

            processReturn: (saleId, reason, authorizedBy) => set((state) => {
                const sale = state.salesHistory.find(s => s.id === saleId);
                if (!sale) return state;

                // 1. Create Refund Transaction (Negative)
                const refundTransaction: SaleTransaction = {
                    ...sale,
                    id: `REF-${Date.now()}`,
                    timestamp: Date.now(),
                    total: -sale.total, // Negative amount
                    items: sale.items.map(item => ({ ...item, quantity: -item.quantity })), // Negative quantities
                    payment_method: 'CASH', // Usually refunds are cash, or match original
                    // status: 'COMPLETED', // Removed as it's not in SaleTransaction
                    dte_status: undefined // Set to undefined instead of 'NOT_SENT'
                };

                // 2. Register Cash Movement (Outflow)
                const refundMovement: CashMovement = {
                    id: `MOV-${Date.now()}`,
                    shift_id: state.currentShift?.id || 'CLOSED',
                    user_id: authorizedBy, // Manager authorizing
                    type: 'OUT',
                    amount: sale.total,
                    reason: 'OTHER',
                    description: `Devolución Venta #${sale.id}: ${reason}`,
                    timestamp: Date.now(),
                    is_cash: true
                };

                // 3. Restore Inventory
                const updatedInventory = [...state.inventory];
                sale.items.forEach(item => {
                    const productIndex = updatedInventory.findIndex(p => p.id === item.batch_id);
                    if (productIndex !== -1) {
                        updatedInventory[productIndex] = {
                            ...updatedInventory[productIndex],
                            stock_actual: updatedInventory[productIndex].stock_actual + item.quantity
                        };
                    }
                });

                return {
                    salesHistory: [refundTransaction, ...state.salesHistory],
                    cashMovements: [refundMovement, ...state.cashMovements],
                    inventory: updatedInventory
                };
            }),

            // --- Attendance ---
            attendanceLogs: [],
            registerAttendance: async (employeeId: string, type: AttendanceType, observation?: string, evidence_photo_url?: string, overtimeMinutes: number = 0) => {
                const state = get();
                const now = Date.now();
                let newStatus: AttendanceStatus = 'OUT';

                if (['CHECK_IN', 'BREAK_END', 'PERMISSION_END'].includes(type)) newStatus = 'IN';
                if (type === 'BREAK_START') newStatus = 'LUNCH';
                if (type === 'PERMISSION_START') newStatus = 'ON_PERMISSION';
                if (['CHECK_OUT', 'MEDICAL_LEAVE', 'EMERGENCY', 'WORK_ACCIDENT'].includes(type)) newStatus = 'OUT';

                // Call Backend Action
                const { registerAttendanceSecure: registerAction } = await import('../../actions/attendance-v2');
                const result = await registerAction({
                    userId: employeeId,
                    type: type as any,
                    locationId: state.currentLocationId || '',
                    method: 'PIN',
                    observation,
                    evidencePhotoUrl: evidence_photo_url,
                    overtimeMinutes
                });

                if (result.success && result.attendanceId) {
                    const newLog: AttendanceLog = {
                        id: result.attendanceId,
                        employee_id: employeeId,
                        timestamp: now,
                        type,
                        overtime_minutes: overtimeMinutes,
                        observation,
                        evidence_photo_url
                    };

                    set((state) => ({
                        attendanceLogs: [...state.attendanceLogs, newLog],
                        employees: state.employees.map(emp =>
                            emp.id === employeeId ? { ...emp, current_status: newStatus } : emp
                        )
                    }));
                    import('sonner').then(({ toast }) => toast.success('Asistencia registrada correctamente'));
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error registrando asistencia: ' + result.error));
                }
            },
            updateEmployeeBiometrics: (employeeId, credentialId) => set((state) => ({
                employees: state.employees.map(emp =>
                    emp.id === employeeId
                        ? { ...emp, biometric_credentials: [...(emp.biometric_credentials || []), credentialId] }
                        : emp
                )
            })),

            // --- WMS & Logistics ---
            stockTransfers: [],
            shipments: [],
            warehouseIncidents: [],

            createDispatch: (shipmentData) => {
                const state = get();
                const now = Date.now();

                // Enrich items with Batch Data
                const enrichedItems = shipmentData.items.map(item => {
                    const batch = state.inventory.find(b => b.id === item.batchId);
                    return {
                        ...item,
                        lot_number: batch?.lot_number,
                        expiry_date: batch?.expiry_date,
                        dci: batch?.dci,
                        unit_price: batch?.price_per_unit || batch?.price
                    };
                });

                const newShipment: Shipment = {
                    ...shipmentData,
                    items: enrichedItems,
                    id: `SHP - ${now} `,
                    status: 'IN_TRANSIT',
                    created_at: now,
                    updated_at: now,
                    documentation: {
                        evidence_photos: []
                    }
                };

                // Deduct stock using registerStockMovement
                shipmentData.items.forEach(item => {
                    state.registerStockMovement(item.batchId, -item.quantity, 'TRANSFER_OUT');
                });

                set((currentState) => ({
                    shipments: [...currentState.shipments, newShipment]
                }));
            },
            cancelShipment: (shipmentId) => set((state) => {
                const shipment = state.shipments.find(s => s.id === shipmentId);
                if (!shipment || shipment.status !== 'IN_TRANSIT') return {};

                const updatedInventory = [...state.inventory];

                // Restore stock to origin
                // NOTE: Direct manipulation to handle potential batch recreation if it was depleted.
                shipment.items.forEach(item => {
                    const originBatchIndex = updatedInventory.findIndex(i => i.sku === item.sku && i.location_id === shipment.origin_location_id);

                    if (originBatchIndex >= 0) {
                        updatedInventory[originBatchIndex] = {
                            ...updatedInventory[originBatchIndex],
                            stock_actual: updatedInventory[originBatchIndex].stock_actual + item.quantity
                        };
                    } else {
                        // Create new batch if missing in origin (unlikely but possible)
                        const productDef = updatedInventory.find(i => i.sku === item.sku);
                        if (productDef) {
                            updatedInventory.push({
                                ...productDef,
                                id: `RESTORE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                location_id: shipment.origin_location_id,
                                stock_actual: item.quantity
                            });
                        }
                    }
                });

                const updatedShipments = state.shipments.map(s =>
                    s.id === shipmentId ? { ...s, status: 'CANCELLED' as const } : s
                );

                import('sonner').then(({ toast }) => {
                    toast.success('Envío cancelado y stock restaurado');
                });

                return { shipments: updatedShipments, inventory: updatedInventory };
            }),
            refreshShipments: async (locationId) => {
                const effectiveId = locationId || get().currentLocationId;
                const { TigerDataService } = await import('../../domain/services/TigerDataService');
                const shipments = await TigerDataService.fetchShipments(effectiveId);
                set({ shipments: shipments || [] });
            },



            confirmReception: (shipmentId, evidenceData) => set((state) => {
                const shipmentIndex = state.shipments.findIndex(s => s.id === shipmentId);
                if (shipmentIndex === -1) return {};

                const shipment = state.shipments[shipmentIndex];
                const now = Date.now();
                const updatedInventory = [...state.inventory];

                evidenceData.receivedItems.forEach(recItem => {
                    // 1. Add to Destination (if GOOD)
                    if (recItem.condition === 'GOOD') {
                        // Try to find existing batch of same SKU + Lot + Expiry at destination
                        const originalItem = shipment.items.find(i => i.batchId === recItem.batchId);

                        // Find match by SKU and Location
                        const destBatchIndex = updatedInventory.findIndex(b =>
                            b.sku === originalItem?.sku &&
                            b.location_id === shipment.destination_location_id &&
                            b.lot_number === originalItem?.lot_number && // Match Lot
                            b.expiry_date === originalItem?.expiry_date // Match Expiry
                        );

                        if (destBatchIndex !== -1) {
                            // Update existing batch
                            updatedInventory[destBatchIndex] = {
                                ...updatedInventory[destBatchIndex],
                                stock_actual: updatedInventory[destBatchIndex].stock_actual + recItem.quantity
                            };
                        } else if (originalItem) {
                            // Create NEW batch with inherited data
                            // We need a template for other fields (name, format, etc.)
                            // We can find any batch of this SKU to copy static data, or use what we have
                            const templateBatch = state.inventory.find(b => b.sku === originalItem.sku);

                            if (templateBatch) {
                                updatedInventory.push({
                                    ...templateBatch, // Copy static data (Name, Format, ISP)
                                    id: `BATCH - ${now} -${Math.random().toString(36).substr(2, 5)} `,
                                    location_id: shipment.destination_location_id,
                                    stock_actual: recItem.quantity,

                                    // INHERITED DYNAMIC DATA
                                    lot_number: originalItem.lot_number || 'S/L',
                                    expiry_date: originalItem.expiry_date || (now + 31536000000), // Default 1 year if missing
                                    price: originalItem.unit_price || templateBatch.price,

                                    stock_min: 10, // Default
                                    stock_max: 100 // Default
                                });
                            }
                        }
                    } else {
                        // Handle DAMAGED (Log incident, move to quarantine, etc.)
                        // Item received DAMAGED
                    }
                });

                // Update Shipment Status
                const updatedShipments = [...state.shipments];
                updatedShipments[shipmentIndex] = {
                    ...shipment,
                    status: 'DELIVERED',
                    updated_at: now,
                    documentation: {
                        ...shipment.documentation,
                        evidence_photos: [...shipment.documentation.evidence_photos, ...evidenceData.photos],
                        observations: evidenceData.notes
                    }
                };

                return {
                    shipments: updatedShipments,
                    inventory: updatedInventory
                };
            }),
            uploadLogisticsDocument: (shipmentId: string, type: 'INVOICE' | 'GUIDE' | 'PHOTO', url: string, observations?: string) => set((state) => {
                const shipmentIndex = state.shipments.findIndex(s => s.id === shipmentId);
                if (shipmentIndex === -1) return {};

                const updatedShipments = [...state.shipments];
                const doc = { ...updatedShipments[shipmentIndex].documentation };

                if (type === 'INVOICE') doc.invoice_url = url;
                if (type === 'GUIDE') doc.dispatch_guide_url = url;
                if (type === 'PHOTO') doc.evidence_photos = [...doc.evidence_photos, url];
                if (observations) doc.observations = observations;

                updatedShipments[shipmentIndex] = {
                    ...updatedShipments[shipmentIndex],
                    documentation: doc,
                    updated_at: Date.now()
                };

                return { shipments: updatedShipments };
            }),

            dispatchTransfer: (transferData) => set((state) => {
                const now = Date.now();
                // Legacy Support: Create Shipment from Transfer
                const newShipment: Shipment = {
                    id: `SHP - LEGACY - ${now} `,
                    type: 'INTER_BRANCH',
                    origin_location_id: transferData.origin_location_id,
                    destination_location_id: transferData.destination_location_id,
                    status: 'IN_TRANSIT',
                    transport_data: {
                        carrier: transferData.shipment_data.carrier_name,
                        tracking_number: transferData.shipment_data.tracking_number,
                        package_count: 1,
                        driver_name: transferData.shipment_data.driver_name
                    },
                    documentation: {
                        evidence_photos: transferData.evidence.photos
                    },
                    items: transferData.items.map(i => ({
                        id: i.batchId,
                        batchId: i.batchId,
                        sku: i.sku,
                        name: i.productName,
                        quantity: i.quantity,
                        condition: 'GOOD'
                    })),
                    valuation: 0,
                    created_at: now,
                    updated_at: now
                };

                const updatedInventory = [...state.inventory];
                transferData.items.forEach(item => {
                    const batchIndex = updatedInventory.findIndex(b => b.id === item.batchId);
                    if (batchIndex !== -1) {
                        updatedInventory[batchIndex] = {
                            ...updatedInventory[batchIndex],
                            stock_actual: updatedInventory[batchIndex].stock_actual - item.quantity
                        };
                    }
                });

                return {
                    shipments: [...state.shipments, newShipment],
                    stockTransfers: [...state.stockTransfers, { ...transferData, id: `TRF - ${now} `, status: 'IN_TRANSIT', timeline: { created_at: now } }],
                    inventory: updatedInventory
                };
            }),

            receiveTransfer: (transferId, incidents) => set((state) => {
                const transferIndex = state.stockTransfers.findIndex(t => t.id === transferId);
                if (transferIndex === -1) return {};

                const updatedTransfers = [...state.stockTransfers];
                updatedTransfers[transferIndex] = {
                    ...updatedTransfers[transferIndex],
                    status: 'RECEIVED',
                    timeline: { ...updatedTransfers[transferIndex].timeline, received_at: Date.now() }
                };

                return { stockTransfers: updatedTransfers };
            }),

            // --- Queue ---
            tickets: [],
            currentTicket: null,
            lastQueueActionTimestamp: 0,
            addTicketToQueue: (ticket: QueueTicket) => set((state) => ({
                tickets: [...state.tickets, ticket]
            })),
            generateTicket: async (rut = 'ANON', branch_id = 'SUC-CENTRO', type = 'GENERAL') => {
                const state = get();
                const { createTicketSecure } = await import('../../actions/queue-v2');

                const result = await createTicketSecure({
                    branchId: branch_id,
                    rut: rut || 'ANON',
                    type: type as any
                });

                if (result.success && result.ticket) {
                    const dbTicket = result.ticket;
                    // Map DB Ticket to Store Ticket
                    let storeStatus: 'WAITING' | 'CALLED' | 'SKIPPED' | 'COMPLETED' = 'WAITING';
                    if (dbTicket.status === 'COMPLETED') storeStatus = 'COMPLETED';
                    if (dbTicket.status === 'NO_SHOW') storeStatus = 'SKIPPED';
                    if (dbTicket.status === 'CALLED') storeStatus = 'CALLED';

                    const ticket: QueueTicket = {
                        id: dbTicket.id,
                        number: dbTicket.code, // Changed from ticket_number to code
                        status: storeStatus,
                        rut: dbTicket.rut || 'ANON', // Changed from customer_rut
                        timestamp: new Date(dbTicket.created_at).getTime(),
                        branch_id: dbTicket.branch_id // Changed from location_id
                    };
                    set((state) => ({ tickets: [...state.tickets, ticket] }));
                    return ticket;
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error generando ticket: ' + result.error));
                    throw new Error(result.error);
                }
            },
            callNextTicket: async (counterId: string) => {
                const state = get();
                const { getNextTicketSecure } = await import('../../actions/queue-v2');
                const branchId = state.currentLocationId || 'SUC-CENTRO';

                // Optimistic timestamp update
                set({ lastQueueActionTimestamp: Date.now() });

                const result = await getNextTicketSecure(branchId, state.user?.id || '', counterId);

                if (result.success && result.ticket) {
                    const dbTicket = result.ticket;
                    const ticket: QueueTicket = {
                        id: dbTicket.id,
                        number: dbTicket.code,
                        status: 'CALLED',
                        rut: dbTicket.rut || 'ANON',
                        timestamp: new Date(dbTicket.created_at).getTime(),
                        branch_id: dbTicket.branch_id,
                        counter: counterId
                    };

                    set((state) => ({
                        currentTicket: ticket,
                        lastQueueActionTimestamp: Date.now(),
                        // Update in tickets list if it exists there
                        tickets: state.tickets.map(t => t.id === ticket.id ? ticket : t)
                    }));
                    return ticket;
                } else {
                    return null;
                }
            },
            completeAndNextTicket: async (counterId: string, currentTicketId: string) => {
                const state = get();
                // Optimistic timestamp update
                set({ lastQueueActionTimestamp: Date.now() });

                const { completeAndGetNextSecure } = await import('../../actions/queue-v2');
                const branchId = state.currentLocationId || 'SUC-CENTRO';

                const result = await completeAndGetNextSecure(currentTicketId, branchId, state.user?.id || '', counterId);

                if (result.success) {
                    let nextTicket: QueueTicket | null = null;
                    if (result.nextTicket) {
                        const dbTicket = result.nextTicket;
                        nextTicket = {
                            id: dbTicket.id,
                            number: dbTicket.code,
                            status: 'CALLED',
                            rut: dbTicket.rut || 'ANON',
                            timestamp: new Date(dbTicket.created_at).getTime(),
                            branch_id: dbTicket.branch_id,
                            counter: counterId
                        };
                    }

                    // Update State
                    set((state) => ({
                        currentTicket: nextTicket,
                        lastQueueActionTimestamp: Date.now(),
                    }));

                    // Force refresh status to keep lists in sync (but refreshQueueStatus will respect timestamp for currentTicket)
                    state.refreshQueueStatus();

                    return { nextTicket, completedTicket: result.completedTicket };
                }
                return { nextTicket: null, completedTicket: null };
            },
            setCurrentTicket: (ticket: QueueTicket | null) => set({ currentTicket: ticket, lastQueueActionTimestamp: Date.now() }),
            refreshQueueStatus: async () => {
                const state = get();
                const { getQueueStatusSecure } = await import('../../actions/queue-v2');
                if (!state.currentLocationId) return;

                const result = await getQueueStatusSecure(state.currentLocationId);
                if (result.success && result.data) {
                    // Map DB tickets to store tickets
                    const allTickets = Array.isArray(result.data) ? result.data : result.data.waitingTickets || [];
                    const mappedTickets: QueueTicket[] = allTickets.map((t: any) => ({
                        id: t.id,
                        number: t.code,
                        status: t.status === 'NO_SHOW' ? 'SKIPPED' : t.status,
                        rut: t.rut || 'ANON',
                        timestamp: new Date(t.created_at).getTime(),
                        branch_id: t.branch_id
                    }));

                    // Handle Current Ticket Sync
                    const calledTickets = result.data.calledTickets || [];
                    const myTicket = calledTickets.find((t: any) =>
                        (state.currentTerminalId && t.terminal_id === state.currentTerminalId) ||
                        (state.user?.id && t.called_by === state.user.id)
                    );

                    set((prevState) => {
                        const changes: Partial<PharmaState> = { tickets: mappedTickets };

                        // Only update currentTicket if no recent local action (> 3000ms)
                        if (Date.now() - prevState.lastQueueActionTimestamp > 3000) {
                            if (myTicket) {
                                // Found my ticket!
                                changes.currentTicket = {
                                    id: myTicket.id,
                                    number: myTicket.code,
                                    status: 'CALLED',
                                    rut: myTicket.rut || 'ANON',
                                    timestamp: new Date(myTicket.created_at).getTime(),
                                    branch_id: myTicket.branch_id,
                                    counter: myTicket.terminal_name
                                };
                            } else {
                                // 🔍 DEBUG: Why did we lose the ticket?
                                if (prevState.currentTicket) {
                                    console.warn('⚠️ [Store] Lost currentTicket during sync!', {
                                        currentTicketId: prevState.currentTicket.id,
                                        availableCalled: calledTickets.map((t: any) => ({
                                            id: t.id,
                                            code: t.code,
                                            called_by: t.called_by,
                                            terminal_id: t.terminal_id
                                        })),
                                        myUser: state.user?.id,
                                        myTerminal: state.currentTerminalId
                                    });
                                }
                                changes.currentTicket = null;
                            }
                        }

                        return changes;
                    });
                }
            },

            // --- SII ---
            siiConfiguration: null,
            siiCafs: [],
            dteDocuments: [],
            updateSiiConfiguration: (config) => set({ siiConfiguration: config }),
            addCaf: (cafData) => set((state) => ({
                siiCafs: [...state.siiCafs, { ...cafData, id: `CAF - ${Date.now()} ` }]
            })),
            getAvailableFolios: (tipoDte) => {
                const state = get();
                const caf = state.siiCafs.find(c => c.tipo_dte === tipoDte && c.active);
                if (!caf) return 0;
                return (caf.rango_hasta - caf.rango_desde) - caf.folios_usados;
            },

            // Intelligent Ordering Methods
            setReorderConfig: (config) => {
                set((state) => {
                    const existing = state.reorderConfigs.findIndex(
                        c => c.sku === config.sku && c.location_id === config.location_id
                    );
                    if (existing >= 0) {
                        const updated = [...state.reorderConfigs];
                        updated[existing] = config;
                        return { reorderConfigs: updated };
                    }
                    return { reorderConfigs: [...state.reorderConfigs, config] };
                });
            },

            getReorderConfig: (sku, locationId) => {
                const state = get();
                return state.reorderConfigs.find(
                    c => c.sku === sku && c.location_id === locationId
                );
            },

            getSalesHistory: (sku, locationId, days) => {
                const state = get();
                const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);

                // Filter sales history for this SKU in the given timeframe
                const relevantSales = state.salesHistory.filter(sale =>
                    sale.timestamp >= cutoffDate &&
                    // Optional: Filter by location if branch_id is available and matches
                    // (!sale.branch_id || sale.branch_id === locationId) 
                    true
                );

                let totalSold = 0;
                relevantSales.forEach(sale => {
                    const item = sale.items.find(i => i.sku === sku);
                    if (item) {
                        totalSold += item.quantity;
                    }
                });

                const daily_avg = days > 0 ? totalSold / days : 0;
                return { total: totalSold, daily_avg };
            },

            analyzeReorderNeeds: (locationId, analysisDays = 30) => {
                const state = get();

                // 1. Construct Virtual Stock Movements from Sales History
                // This is needed because IntelligentOrderingService expects StockMovement[]
                const virtualStockMovements: StockMovement[] = state.salesHistory.flatMap(sale =>
                    sale.items.map(item => ({
                        id: `VIRTUAL-MOV-${sale.id}-${item.sku}`,
                        sku: item.sku,
                        product_name: item.name,
                        location_id: sale.branch_id || locationId, // Use sale branch or default to target location
                        movement_type: 'SALE',
                        quantity: -item.quantity, // Sales reduce stock
                        stock_before: 0, // Not needed for this analysis
                        stock_after: 0, // Not needed for this analysis
                        timestamp: sale.timestamp,
                        user_id: sale.seller_id,
                        batch_id: item.batch_id
                    }))
                );

                // 2. Derive Reorder Configurations from Inventory
                // If a specific config exists in state.reorderConfigs, use it. 
                // Otherwise, derive from inventory item properties.
                const derivedConfigs: ReorderConfig[] = state.inventory
                    .filter(item => item.location_id === locationId)
                    .map(item => {
                        // Check if explicit config exists
                        const explicitConfig = state.reorderConfigs.find(c => c.sku === item.sku && c.location_id === locationId);
                        if (explicitConfig) return explicitConfig;

                        // Derive from item properties
                        return {
                            sku: item.sku,
                            location_id: item.location_id,
                            min_stock: item.stock_min || 5, // Default fallback
                            max_stock: item.stock_max || 20, // Default fallback
                            safety_stock: item.safety_stock || 0,
                            auto_reorder_enabled: true, // Enable by default if parameters exist
                            preferred_supplier_id: item.preferred_supplier_id,
                            lead_time_days: item.lead_time_days || 3, // Default 3 days
                            review_period_days: 7
                        };
                    });

                // 3. Run Analysis Service
                return IntelligentOrderingService.analyzeReorderNeeds(
                    state.inventory,
                    derivedConfigs,
                    virtualStockMovements,
                    locationId,
                    analysisDays
                );
            },

            generateSuggestedPOs: (suggestions) => {
                return IntelligentOrderingService.generateSuggestedPOs(
                    suggestions,
                    get().suppliers,
                    get().inventory
                );
            }
        }),
        {
            name: 'pharma-storage', // unique name
            storage: createJSONStorage(() => indexedDBWithLocalStorageFallback),
            // Persist settings + offline cache needed to survive refresh without internet.
            partialize: (state) => ({
                // Persistir sesión del usuario para evitar re-login
                // IMPORTANTE: Ocultar PIN del usuario activo en persistencia
                user: state.user ? { ...state.user, access_pin: undefined } : null,

                // Cache offline crítica para operar sin conexión
                // IMPORTANTE: Hashing simple de PINs para no guardar en texto plano (Requirement)
                employees: state.employees.map(e => ({
                    ...e,
                    // Simple Hash: Base64 + Reverse para ofuscación básica
                    access_pin: e.access_pin ? typeof window !== 'undefined' ? window.btoa(e.access_pin).split('').reverse().join('') : e.access_pin : undefined
                })),
                inventory: state.inventory,
                customers: state.customers,
                suppliers: state.suppliers,
                supplierDocuments: state.supplierDocuments,
                purchaseOrders: state.purchaseOrders,
                salesHistory: state.salesHistory,
                cashMovements: state.cashMovements,
                expenses: state.expenses,
                currentShift: state.currentShift,
                dailyShifts: state.dailyShifts,
                terminals: state.terminals,
                cart: state.cart,
                currentCustomer: state.currentCustomer,
                tickets: state.tickets,
                currentTicket: state.currentTicket,
                lastQueueActionTimestamp: state.lastQueueActionTimestamp,
                // Configuraciones
                printerConfig: state.printerConfig,
                siiConfiguration: state.siiConfiguration,
                loyaltyConfig: state.loyaltyConfig,
                // Contexto de ubicación
                currentLocationId: state.currentLocationId,
                currentWarehouseId: state.currentWarehouseId,
                currentTerminalId: state.currentTerminalId
            }),
        }
    )
);
