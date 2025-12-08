
import { create } from 'zustand';
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
import { fetchEmployees } from '../../actions/sync';
import { IntelligentOrderingService } from '../services/intelligentOrderingService';
import { MOCK_INVENTORY, MOCK_EMPLOYEES, MOCK_SUPPLIERS, MOCK_SHIPMENTS } from '../../domain/mocks';

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
    login: (userId: string, pin: string) => Promise<boolean>;
    logout: () => void;

    // Data Sync
    isLoading: boolean;
    isInitialized: boolean;
    syncData: () => Promise<void>;

    // Inventory
    inventory: InventoryBatch[];
    suppliers: Supplier[];
    supplierDocuments: SupplierDocument[];
    purchaseOrders: PurchaseOrder[];
    updateStock: (batchId: string, quantity: number) => void;
    addStock: (batchId: string, quantity: number, expiry?: number) => void;
    addNewProduct: (product: InventoryBatch) => void;
    fetchInventory: (locationId?: string, warehouseId?: string) => Promise<void>;
    transferStock: (batchId: string, targetLocation: string, quantity: number) => Promise<void>;
    addPurchaseOrder: (po: PurchaseOrder) => void;
    receivePurchaseOrder: (poId: string, receivedItems: { sku: string, receivedQty: number; lotNumber?: string; expiryDate?: number }[], destinationLocationId: string) => Promise<void>;
    cancelPurchaseOrder: (poId: string) => void;
    updatePurchaseOrder: (id: string, data: Partial<PurchaseOrder>) => void;

    // SRM Actions
    addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
    updateSupplier: (id: string, data: Partial<Supplier>) => void;
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
    createQuote: (customer?: Customer) => Quote;
    retrieveQuote: (quoteId: string) => boolean; // Returns true if found and loaded

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
    addCustomer: (customer: Omit<Customer, 'id' | 'totalPoints' | 'lastVisit' | 'health_tags' | 'name' | 'age'>) => Customer;
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
    addTerminal: (terminal: Omit<Terminal, 'id'>) => void;
    updateTerminal: (id: string, updates: Partial<Terminal>) => void;
    cashMovements: CashMovement[];

    openShift: (amount: number, cashierId: string, authorizedBy: string, terminalId: string, locationId: string) => void;
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

    // Import
    importInventory: (items: InventoryBatch[]) => void;

    // Queue
    tickets: QueueTicket[];
    currentTicket: QueueTicket | null;
    generateTicket: (rut?: string, branch_id?: string) => Promise<QueueTicket>;
    callNextTicket: (counterId: string) => void;
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


export const usePharmaStore = create<PharmaState>()(
    persist(
        (set, get) => ({
            // --- Multi-Branch State ---
            currentLocationId: '', // Default empty to force selection
            currentWarehouseId: '', // Default empty
            currentTerminalId: '', // Default empty
            setCurrentLocation: (loc, wh, term) => set({ currentLocationId: loc, currentWarehouseId: wh, currentTerminalId: term }),

            // --- Auth ---
            user: null, // ALWAYS start logged out - force login
            employees: [], // ⚠️ DEBUG: Start empty to prove DB connection
            login: async (userId, pin) => {
                let authenticatedUser: EmployeeProfile | null = null;

                // 1. Online Attempt
                try {
                    const { TigerDataService } = await import('../../domain/services/TigerDataService');
                    const result = await TigerDataService.authenticate(userId, pin);
                    if (result.success && result.user) {
                        authenticatedUser = result.user;
                    }
                } catch (error) {
                    console.warn('⚠️ Online login failed/unreachable, trying offline fallback...', error);
                }

                // 2. Offline Fallback
                if (!authenticatedUser) {
                    const { employees } = get();
                    const offlineUser = employees.find(e => e.id === userId && e.access_pin === pin);

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

                    // Auto-Set Location Context based on User Assignment
                    if (authenticatedUser.assigned_location_id) {
                        try {
                            const { getLocations } = await import('../../actions/locations');
                            const locRes = await getLocations();
                            if (locRes.success && locRes.data) {
                                const assignedLoc = locRes.data.find(l => l.id === authenticatedUser!.assigned_location_id);
                                if (assignedLoc) {
                                    const warehouseId = assignedLoc.default_warehouse_id || '';
                                    console.log(`📍 Auto-Setting Context: Location=${assignedLoc.name}, Warehouse=${warehouseId}`);

                                    set({
                                        currentLocationId: assignedLoc.id,
                                        currentWarehouseId: warehouseId,
                                        // Try to find a terminal? Or leave empty for manual selection.
                                        currentTerminalId: ''
                                    });

                                    // ⚡️ Refresh Inventory for the new context
                                    if (warehouseId) {
                                        get().fetchInventory(assignedLoc.id, warehouseId).catch(console.error);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Failed to auto-set location context:', e);
                        }
                    }

                    return true;
                }

                return false;
            },
            logout: () => set({ user: null }),

            // --- Data Sync ---
            isLoading: false,
            isInitialized: false,
            syncData: async () => {
                if (get().isInitialized) {
                    console.log('🔄 Data already synced, skipping...');
                    return;
                }
                set({ isLoading: true });
                try {
                    // const { TigerDataService } = await import('../../domain/services/TigerDataService'); // REMOVED
                    const currentStoreState = get();

                    // 0. PUSH SYNC: Send pending sales to server first
                    const pendingSales = currentStoreState.salesHistory.filter(s => s.is_synced === false);
                    if (pendingSales.length > 0) {
                        console.log(`📡 Syncing ${pendingSales.length} pending sales to cloud...`);
                        const { TigerDataService } = await import('../../domain/services/TigerDataService');

                        // Process sequentially to ensure order (or Promise.all for speed)
                        for (const sale of pendingSales) {
                            try {
                                const result = await TigerDataService.saveSaleTransaction(
                                    { ...sale, is_synced: undefined }, // Clean flag for server
                                    sale.branch_id || currentStoreState.currentLocationId,
                                    sale.terminal_id
                                );

                                if (result.success) {
                                    // Mark as synced efficiently
                                    set(state => ({
                                        salesHistory: state.salesHistory.map(s =>
                                            s.id === sale.id ? { ...s, is_synced: true } : s
                                        )
                                    }));
                                }
                            } catch (e) {
                                console.error(`Failed to sync sale ${sale.id}:`, e);
                            }
                        }
                    }

                    const [inventory, employees, sales, suppliers, cashMovements] = await Promise.all([
                        TigerDataService.fetchInventory(currentStoreState.currentWarehouseId), // Filter by Store's Warehouse
                        fetchEmployees(),
                        TigerDataService.fetchSalesHistory(), // Fetch real sales
                        import('../../actions/sync').then(m => m.fetchSuppliers()), // Fetch real suppliers
                        TigerDataService.fetchCashMovements() // Fetch real cash movements
                    ]);

                    // Si falla la DB (Safe Mode devuelve []), mantenemos lo que haya o usamos un fallback mínimo si está vacío
                    // Si falla la DB (Safe Mode devuelve []), mantenemos lo que haya o usamos un fallback mínimo si está vacío
                    if (inventory.length > 0) set({ inventory });

                    if (employees.length > 0) {
                        set({ employees });
                    } else {
                        // Si la DB devuelve vacío (ej: primera carga), no usar Mocks para evitar confusión.
                        // Solo usar mocks si explícitamente estamos en modo demo/offline sin conexión.
                        console.log('ℹ️ No employees found in DB.');
                        set({ employees: [] });
                    }

                    // Sync Sales
                    if (sales.length > 0) {
                        set({ salesHistory: sales });
                    }

                    // Sync Suppliers
                    if (suppliers && suppliers.length > 0) {
                        set({ suppliers });
                    }

                    // Sync Cash & Expenses
                    if (cashMovements.length > 0) {
                        set({
                            cashMovements: cashMovements,
                            // Derive expenses from cash movements (OUT and not valid withdrawals)
                            expenses: cashMovements.filter(m =>
                                m.type === 'OUT' && (
                                    m.reason === 'SUPPLIES' ||
                                    m.reason === 'SERVICES' ||
                                    m.reason === 'SALARY_ADVANCE' ||
                                    m.reason === 'OTHER'
                                )
                            ).map(m => ({
                                id: m.id,
                                description: m.description, // Description holds the user text
                                amount: m.amount,
                                category: (m.reason === 'SUPPLIES' ? 'INSUMOS' : m.reason === 'SERVICES' ? 'SERVICIOS' : 'OTROS') as any,
                                date: m.timestamp,
                                is_deductible: false
                            }))
                        });
                    }

                    const state = get();

                    // Initialize TigerDataService with current store data
                    // const { TigerDataService } = await import('../../domain/services/TigerDataService'); // REMOVED
                    TigerDataService.initializeStorage({
                        products: state.inventory,
                        employees: state.employees,
                        sales: state.salesHistory,
                        cashMovements: state.cashMovements,
                        expenses: state.expenses
                    });

                    // ✅ Data Synced & Tiger Data Initialized
                    set({ isInitialized: true });
                } catch (error) {
                    console.error('❌ Sync failed:', error);
                    // Show a friendly toast to the user
                    import('sonner').then(({ toast }) => {
                        toast.error('Modo Sin Conexión / Demo', {
                            description: 'No se pudo conectar con el servidor. Usando datos locales.',
                            duration: 5000,
                        });
                    });
                } finally {
                    set({ isLoading: false });
                }
            },

            fetchInventory: async (locationId, warehouseId) => {
                set({ isLoading: true });
                try {
                    const state = get();
                    const wh = warehouseId || state.currentWarehouseId;
                    // Use TigerDataService to fetch inventory consistent with syncData
                    // Ensure TigerDataService is imported or available. It is imported at top.
                    const { TigerDataService } = await import('../../domain/services/TigerDataService');
                    const inventory = await TigerDataService.fetchInventory(wh);
                    set({ inventory, isLoading: false });
                } catch (error) {
                    console.error(error);
                    set({ isLoading: false });
                }
            },

            // --- Inventory ---
            inventory: [], // ⚠️ DEBUG: Start empty to prove DB connection
            suppliers: MOCK_SUPPLIERS,
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

                const { executeTransfer } = await import('../../actions/wms');

                const result = await executeTransfer({
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
                    await get().fetchInventory(state.currentLocationId, state.currentWarehouseId);
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error en traspaso: ' + result.error));
                }
            },
            addPurchaseOrder: (po) => set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] })),
            receivePurchaseOrder: async (poId, receivedItems, destinationLocationId) => {
                const state = get();
                const { receivePurchaseOrder: receivePOAction } = await import('../../actions/supply');

                const result = await receivePOAction({
                    purchaseOrderId: poId,
                    userId: state.user?.id || 'SYSTEM',
                    receivedItems: receivedItems.map(i => ({
                        sku: i.sku,
                        quantity: i.receivedQty,
                        lotNumber: i.lotNumber,
                        expiryDate: i.expiryDate
                    }))
                });

                if (result.success) {
                    import('sonner').then(({ toast }) => toast.success('Recepción de Orden exitosa'));
                    await get().fetchInventory(state.currentLocationId, state.currentWarehouseId);

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
                    po.id === poId ? { ...po, status: 'CANCELLED' as any } : po // Casting as any because CANCELLED might not be in POStatus yet, need to check types.ts
                )
            })),
            updatePurchaseOrder: (id, data) => set((state) => ({
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === id ? { ...po, ...data } : po
                )
            })),

            // --- SRM Actions ---
            addSupplier: async (supplierData) => {
                const { createSupplier } = await import('../../actions/suppliers');
                const result = await createSupplier(supplierData as any);
                if (result.success && result.id) {
                    set((state) => ({
                        suppliers: [...state.suppliers, { ...supplierData, id: result.id }]
                    }));
                    import('sonner').then(({ toast }) => toast.success('Proveedor guardado correctamente'));
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error al guardar proveedor'));
                }
            },
            updateSupplier: (id, data) => set((state) => ({
                suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s)
            })),
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
                    // 1. Create sale transaction object
                    const saleTransaction: SaleTransaction = {
                        id: `SALE - ${Date.now()} -${Math.floor(Math.random() * 1000)} `,
                        timestamp: Date.now(),
                        items: state.cart.map(item => ({
                            batch_id: item.batch_id || 'UNKNOWN',
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
                        terminal_id: state.currentTerminalId
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
                            toast.warning('Venta guardada localmente (Sin conexión)', {
                                description: 'Se sincronizará cuando recupere internet.'
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
            customers: [
                {
                    id: 'C-001',
                    rut: '11.111.111-1',
                    fullName: 'Cliente Frecuente Demo',
                    name: 'Cliente Frecuente Demo',
                    phone: '+56912345678',
                    email: 'demo@cliente.cl',
                    totalPoints: 1500,
                    registrationSource: 'ADMIN',
                    lastVisit: Date.now() - 86400000,
                    age: 45,
                    health_tags: ['HYPERTENSION'],
                    total_spent: 150000,
                    tags: ['VIP'],
                    status: 'ACTIVE'
                }
            ],
            addCustomer: (data) => {
                const newCustomer: Customer = {
                    ...data,
                    id: `CUST - ${Date.now()} `,
                    totalPoints: 0,
                    lastVisit: Date.now(),
                    health_tags: [],
                    name: data.fullName, // Legacy support
                    age: 0, // Default
                    total_spent: 0,
                    tags: [],
                    status: 'ACTIVE'
                };
                set((state) => ({
                    customers: [...state.customers, newCustomer],
                    currentCustomer: newCustomer
                }));
                return newCustomer;
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
            createQuote: (customer) => {
                const state = get();
                const newQuote: Quote = {
                    id: `COT-${Date.now().toString().slice(-6)}`,
                    created_at: Date.now(),
                    expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
                    customer_id: customer?.id,
                    total_amount: state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                    status: 'ACTIVE',
                    items: [...state.cart]
                };

                set((state) => ({
                    quotes: [...state.quotes, newQuote],
                    cart: [], // Clear cart after saving quote
                    currentCustomer: null
                }));

                import('sonner').then(({ toast }) => {
                    toast.success(`Cotización guardada: ${newQuote.id}`);
                });

                return newQuote;
            },
            retrieveQuote: (quoteId) => {
                const state = get();
                // Try to find by exact ID or by suffix (for barcode scanning)
                const quote = state.quotes.find(q => q.id === quoteId || q.id.endsWith(quoteId.replace('COT-', '')));

                if (!quote || quote.status !== 'ACTIVE') {
                    import('sonner').then(({ toast }) => {
                        toast.error('Cotización no encontrada o expirada');
                    });
                    return false;
                }

                // Load items to cart
                set({
                    cart: quote.items,
                    currentCustomer: state.customers.find(c => c.id === quote.customer_id) || null
                });

                import('sonner').then(({ toast }) => {
                    toast.success(`Cotización cargada: ${quote.id}`);
                });

                return true;
            },


            // --- Cash Management & Shifts ---
            currentShift: null,
            dailyShifts: [],
            locations: [],
            fetchLocations: async () => {
                try {
                    const { getLocations } = await import('../../actions/locations');
                    const result = await getLocations();
                    if (result.success && result.data) {
                        set({ locations: result.data });
                    }
                } catch (error) {
                    console.error('Failed to fetch locations', error);
                }
            },

            terminals: [],
            fetchTerminals: async (locationId: string) => {
                try {
                    const { getTerminalsByLocation } = await import('../../actions/terminals');
                    const result = await getTerminalsByLocation(locationId);
                    if (result.success && result.data) {
                        set({ terminals: result.data });
                    } else {
                        set({ terminals: [] });
                    }
                } catch (error) {
                    console.error('Failed to fetch terminals', error);
                    set({ terminals: [] });
                }
            },

            addTerminal: (terminal) => set((state) => ({
                terminals: [...state.terminals, { ...terminal, id: `TERM-${Date.now()}` }]
            })),
            updateTerminal: (id, updates) => set((state) => ({
                terminals: state.terminals.map(t => t.id === id ? { ...t, ...updates } : t)
            })),
            cashMovements: [],

            openShift: (amount, cashierId, authorizedBy, terminalId, locationId) => set((state) => {
                if (state.currentShift?.status === 'ACTIVE') return state;

                const newShift: Shift = {
                    id: `SHIFT-${Date.now()}`,
                    terminal_id: terminalId,
                    user_id: cashierId,
                    authorized_by: authorizedBy,
                    start_time: Date.now(),
                    opening_amount: amount,
                    status: 'ACTIVE'
                };

                // Update terminal status
                const updatedTerminals = state.terminals.map(t =>
                    t.id === terminalId ? { ...t, status: 'OPEN' as const } : t
                );

                return {
                    currentShift: newShift,
                    terminals: updatedTerminals,
                    currentLocationId: locationId,
                    currentTerminalId: terminalId
                };
            }),

            closeShift: (finalAmount, authorizedBy) => set((state) => {
                if (!state.currentShift) return state;
                const metrics = state.getShiftMetrics();

                const closedShift: Shift = {
                    ...state.currentShift,
                    end_time: Date.now(),
                    status: 'CLOSED',
                    closing_amount: finalAmount,
                    difference: finalAmount - metrics.expectedCash
                };

                // Update terminal status
                const updatedTerminals = state.terminals.map(t =>
                    t.id === state.currentShift!.terminal_id ? { ...t, status: 'CLOSED' as const } : t
                );

                return {
                    currentShift: null, // Reset current shift
                    dailyShifts: [...state.dailyShifts, closedShift], // Archive it
                    terminals: updatedTerminals,
                    cart: [], // Clear cart
                    currentCustomer: null // Clear customer
                };
            }),
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
                const totalOutflows = shiftMovements.filter(m => m.type === 'OUT' && m.is_cash).reduce((sum, m) => sum + m.amount, 0);
                const totalInflows = shiftMovements.filter(m => m.type === 'IN' && m.is_cash).reduce((sum, m) => sum + m.amount, 0);

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
                const { registerAttendance: registerAction } = await import('../../actions/attendance');
                const result = await registerAction(
                    employeeId,
                    type as any, // Cast to match limited backend types if needed, or update backend types
                    state.currentLocationId,
                    'PIN', // Default method
                    observation,
                    evidence_photo_url,
                    overtimeMinutes
                );

                if (result.success) {
                    const newLog: AttendanceLog = {
                        id: result.data.id,
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
            shipments: MOCK_SHIPMENTS,
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
                    type: 'INTERNAL_TRANSFER',
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
            addTicketToQueue: (ticket: QueueTicket) => set((state) => ({
                tickets: [...state.tickets, ticket]
            })),
            generateTicket: async (rut = 'ANON', branch_id = 'SUC-CENTRO') => {
                const state = get();
                const { generateTicket: generateTicketAction } = await import('../../actions/queue');

                const result = await generateTicketAction({
                    rut: rut === 'ANON' ? undefined : rut,
                    serviceType: 'FARMACIA', // Default service type
                    locationId: branch_id
                });

                if (result.success && result.ticket) {
                    const dbTicket = result.ticket;
                    // Map DB Ticket to Store Ticket
                    let storeStatus: 'WAITING' | 'CALLED' | 'SKIPPED' | 'COMPLETED' = 'WAITING';
                    if (dbTicket.status === 'SERVED') storeStatus = 'COMPLETED';
                    if (dbTicket.status === 'CANCELLED') storeStatus = 'SKIPPED';

                    const ticket: QueueTicket = {
                        id: dbTicket.id,
                        number: dbTicket.ticket_number,
                        status: storeStatus,
                        rut: dbTicket.customer_rut || 'ANON',
                        timestamp: new Date(dbTicket.created_at).getTime(),
                        branch_id: dbTicket.location_id
                    };
                    set((state) => ({ tickets: [...state.tickets, ticket] }));
                    return ticket;
                } else {
                    import('sonner').then(({ toast }) => toast.error('Error generando ticket: ' + result.error));
                    throw new Error(result.error);
                }
            },
            callNextTicket: () => {
                const state = get();
                const nextTicket = state.tickets.find(t => t.status === 'WAITING');
                if (!nextTicket) return null;

                const updatedTickets = state.tickets.map(t =>
                    t.id === nextTicket.id ? { ...t, status: 'CALLED' as const } : t
                );

                set({ tickets: updatedTickets });
                return nextTicket;
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
            name: 'farmacias-vallenar-DEBUG-v1', // ⚠️ DEBUG MODE: Force clean slate
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                user: state.user,
                cart: state.cart,
                inventory: state.inventory,
                customers: state.customers,
                salesHistory: state.salesHistory,
                expenses: state.expenses,
                currentShift: state.currentShift,
                cashMovements: state.cashMovements,
                attendanceLogs: state.attendanceLogs,
                employees: state.employees,
                stockTransfers: state.stockTransfers,
                warehouseIncidents: state.warehouseIncidents,
                siiConfiguration: state.siiConfiguration,
                siiCafs: state.siiCafs,
                dteDocuments: state.dteDocuments
            }),
            // Merge function to ensure employees are never empty
            merge: (persistedState: any, currentState: PharmaState) => ({
                ...currentState,
                ...persistedState,
                // Always ensure employees are populated
                employees: (persistedState?.employees && persistedState.employees.length > 0)
                    ? persistedState.employees
                    : MOCK_EMPLOYEES
            })
        }
    )
);
