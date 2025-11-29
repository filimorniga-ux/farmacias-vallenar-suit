
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
    Shipment,
    StockTransfer,
    WarehouseIncident,
    AttendanceStatus,
    AttendanceType
} from '../../domain/types';
import { fetchInventory, fetchEmployees } from '../../actions/sync';

// --- DATOS REALES FARMACIAS VALLENAR ---
const MOCK_INVENTORY: InventoryBatch[] = [
    // --- TOP VENTAS & CRÓNICOS ---
    {
        id: 'P001', sku: '780001', name: 'PARACETAMOL 500MG', dci: 'PARACETAMOL', laboratory: 'Mintlab', condition: 'VD',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'GÓNDOLA',
        stock_actual: 2000, stock_min: 200, stock_max: 3000, expiry_date: new Date('2026-12-01').getTime(),
        price: 990, cost_price: 400,
        cost_net: 336, tax_percent: 19, price_sell_box: 990, price_sell_unit: 62,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Paracetamol'], therapeutic_tags: ['DOLOR', 'FIEBRE', 'CABEZA'],
        storage_condition: 'AMBIENTE', concentration: '500mg', format: 'Comprimido', unit_count: 16, is_generic: true,
        isp_register: 'F-1234/20', units_per_box: 16, unit_format_string: 'Comprimidos', price_per_unit: 62
    },
    {
        id: 'P002', sku: '780002', name: 'LOSARTÁN 50MG', dci: 'LOSARTÁN POTÁSICO', laboratory: 'Lab Chile', condition: 'R',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A1',
        stock_actual: 500, stock_min: 100, stock_max: 800, expiry_date: new Date('2025-06-01').getTime(),
        price: 2990, cost_price: 1000,
        cost_net: 840, tax_percent: 19, price_sell_box: 2990, price_sell_unit: 100,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Losartán Potásico'], therapeutic_tags: ['HIPERTENSION', 'CORAZON'],
        contraindications: ['EMBARAZO'], storage_condition: 'AMBIENTE', concentration: '50mg', format: 'Comprimido', unit_count: 30, is_generic: true,
        isp_register: 'F-9988/21', units_per_box: 30, unit_format_string: 'Comprimidos', price_per_unit: 100
    },
    {
        id: 'P003', sku: '780003', name: 'IBUPROFENO 600MG', dci: 'IBUPROFENO', laboratory: 'Lab Chile', condition: 'VD',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A2',
        stock_actual: 800, stock_min: 100, stock_max: 1200, expiry_date: new Date('2026-01-01').getTime(),
        price: 1990, cost_price: 600,
        cost_net: 504, tax_percent: 19, price_sell_box: 1990, price_sell_unit: 100,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Ibuprofeno'], therapeutic_tags: ['DOLOR', 'INFLAMACION', 'CABEZA'],
        contraindications: ['ULCERA', 'EMBARAZO'], storage_condition: 'AMBIENTE', concentration: '600mg', format: 'Comprimido', unit_count: 20, is_generic: true,
        isp_register: 'F-5544/19', units_per_box: 20, unit_format_string: 'Comprimidos', price_per_unit: 100
    },
    {
        id: 'P004', sku: '780004', name: 'EUTIROX 100MCG', dci: 'LEVOTIROXINA', laboratory: 'Merck', condition: 'R',
        is_bioequivalent: false, bioequivalent_status: 'NO_BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE B1',
        stock_actual: 150, stock_min: 30, stock_max: 300, expiry_date: new Date('2025-10-01').getTime(),
        price: 8500, cost_price: 3500,
        cost_net: 2941, tax_percent: 19, price_sell_box: 8500, price_sell_unit: 170,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Levotiroxina'], therapeutic_tags: ['TIROIDES'],
        storage_condition: 'AMBIENTE', concentration: '100mcg', format: 'Comprimido', unit_count: 50, is_generic: false,
        isp_register: 'F-2211/18', units_per_box: 50, unit_format_string: 'Comprimidos', price_per_unit: 170
    },

    // --- RETAIL & COMISIONABLES ---
    {
        id: 'R001', sku: 'RET-01', name: 'MAAM CREMA PRENATAL', dci: 'N/A', laboratory: 'Milab', brand: 'Maam', condition: 'VD',
        is_bioequivalent: false, bioequivalent_status: 'NO_BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'BELLEZA',
        stock_actual: 40, stock_min: 10, stock_max: 80, expiry_date: new Date('2027-01-01').getTime(),
        price: 15847, cost_price: 8000,
        cost_net: 6722, tax_percent: 19, price_sell_box: 15847, price_sell_unit: 15847,
        category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [], image_url: '/images/maam.jpg',
        storage_condition: 'AMBIENTE', concentration: 'N/A', format: 'Crema', unit_count: 1, is_generic: false,
        isp_register: 'N/A', units_per_box: 1, unit_format_string: 'Unidad', price_per_unit: 15847
    }
];

const MOCK_EMPLOYEES: EmployeeProfile[] = [
    {
        id: 'EMP-001',
        rut: '11.111.111-1',
        name: 'Miguel Pérez',
        role: 'MANAGER',
        access_pin: '9080',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'GERENTE_GENERAL',
        base_salary: 2500000,
        weekly_hours: 44,
        pension_fund: 'HABITAT',
        health_system: 'ISAPRE',
        mutual_safety: 'ACHS',
        allowed_modules: ['POS', 'INVENTORY', 'HR', 'REPORTS', 'SUPPLIERS']
    },
    {
        id: 'EMP-002',
        rut: '22.222.222-2',
        name: 'Javiera Rojas',
        role: 'QF',
        access_pin: '9080',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'DIRECTOR_TECNICO',
        base_salary: 1800000,
        weekly_hours: 44,
        pension_fund: 'MODELO',
        health_system: 'FONASA',
        allowed_modules: ['POS', 'INVENTORY', 'REPORTS', 'SUPPLIERS']
    },
    {
        id: 'EMP-003',
        rut: '33.333.333-3',
        name: 'Camila Cajera',
        role: 'CASHIER',
        access_pin: '9080',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'CAJERO_VENDEDOR',
        base_salary: 500000,
        weekly_hours: 45,
        pension_fund: 'PROVIDA',
        health_system: 'FONASA',
        allowed_modules: ['POS', 'INVENTORY']
    },
    {
        id: 'EMP-004',
        rut: '44.444.444-4',
        name: 'Pedro Bodega',
        role: 'WAREHOUSE',
        access_pin: '9080',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'BODEGA_CENTRAL',
        assigned_location_id: 'BODEGA_CENTRAL',
        job_title: 'ASISTENTE_BODEGA',
        base_salary: 550000,
        weekly_hours: 45,
        pension_fund: 'CAPITAL',
        health_system: 'FONASA',
        allowed_modules: ['INVENTORY', 'SUPPLIERS']
    },
];

// --- MOCK SUPPLIERS ---
const MOCK_SUPPLIERS: Supplier[] = [
    {
        id: 'SUP-001',
        rut: '76.111.111-1',
        business_name: 'Laboratorio Chile S.A.',
        fantasy_name: 'LabChile',
        contact_email: 'ventas@labchile.cl',
        lead_time_days: 2,
        contacts: [
            { name: 'Juan Pérez', role: 'SALES', email: 'juan.perez@labchile.cl', phone: '+56911111111', is_primary: true },
            { name: 'María González', role: 'BILLING', email: 'facturacion@labchile.cl', phone: '+56911111112', is_primary: false }
        ],
        categories: ['MEDICAMENTOS'],
        payment_terms: '30_DIAS',
        rating: 5,
        bank_account: { bank: 'Banco de Chile', account_type: 'CORRIENTE', account_number: '111-222-333', email_notification: 'pagos@labchile.cl' },
        address: 'Av. Marathon 1315', region: 'RM', city: 'Santiago', commune: 'Ñuñoa', postal_code: '7750000',
        phone_1: '+56223334444', email_orders: 'pedidos@labchile.cl', email_billing: 'facturacion@labchile.cl', sector: 'LABORATORIO', brands: ['LabChile']
    },
    {
        id: 'SUP-002',
        rut: '76.222.222-2',
        business_name: 'Novo Nordisk Farmacéutica Ltda.',
        fantasy_name: 'Novo Nordisk',
        contact_email: 'orders@novo.com',
        lead_time_days: 5,
        contacts: [
            { name: 'Ana Silva', role: 'SALES', email: 'ana.silva@novo.com', phone: '+56922222222', is_primary: true }
        ],
        categories: ['MEDICAMENTOS', 'INSUMOS'],
        payment_terms: '60_DIAS',
        rating: 4,
        address: 'Av. Alonso de Córdova 5151', region: 'RM', city: 'Santiago', commune: 'Las Condes', postal_code: '7550000',
        phone_1: '+56225556666', email_orders: 'pedidos@novo.com', email_billing: 'billing@novo.com', sector: 'LABORATORIO', brands: ['Novo Nordisk']
    },
    {
        id: 'SUP-003',
        rut: '76.333.333-3',
        business_name: 'Droguería Hofmann S.A.',
        fantasy_name: 'Droguería Hofmann',
        contact_email: 'contacto@hofmann.cl',
        lead_time_days: 3,
        contacts: [],
        categories: ['INSUMOS', 'RETAIL'],
        payment_terms: 'CONTADO',
        rating: 3,
        address: 'San Ignacio 500', region: 'RM', city: 'Santiago', commune: 'Quilicura', postal_code: '8700000',
        phone_1: '+56227778888', email_orders: 'ventas@hofmann.cl', email_billing: 'pagos@hofmann.cl', sector: 'DISTRIBUIDORA', brands: ['Varios']
    },
];

// --- MOCK SHIPMENTS FOR WMS ---
const MOCK_SHIPMENTS: Shipment[] = [
    // INBOUND from Laboratorio Chile
    {
        id: 'SHP-001',
        type: 'INBOUND_PROVIDER',
        origin_location_id: 'PROVEEDOR_LABCHILE',
        destination_location_id: 'SUCURSAL_CENTRO',
        status: 'IN_TRANSIT',
        transport_data: {
            carrier: 'STARKEN',
            tracking_number: 'STK-2024-001',
            package_count: 3,
            driver_name: 'Juan Pérez'
        },
        documentation: {
            invoice_url: '/docs/invoice-001.pdf',
            dispatch_guide_url: '/docs/guide-001.pdf',
            evidence_photos: []
        },
        items: [
            { batchId: 'P001', sku: '780001', name: 'PARACETAMOL 500MG', quantity: 500, condition: 'GOOD' },
            { batchId: 'P003', sku: '780003', name: 'IBUPROFENO 600MG', quantity: 300, condition: 'GOOD' }
        ],
        valuation: 450000,
        created_at: Date.now() - 86400000, // 1 day ago
        updated_at: Date.now() - 86400000
    },
    // INBOUND from Droguería Ñuñoa
    {
        id: 'SHP-002',
        type: 'INBOUND_PROVIDER',
        origin_location_id: 'PROVEEDOR_DROGÑUÑOA',
        destination_location_id: 'SUCURSAL_CENTRO',
        status: 'PREPARING',
        transport_data: {
            carrier: 'CHILEXPRESS',
            tracking_number: 'CHX-2024-002',
            package_count: 2,
        },
        documentation: {
            evidence_photos: []
        },
        items: [
            { batchId: 'G003', sku: 'LC-003', name: 'OMEPRAZOL 20MG', quantity: 200, condition: 'GOOD' },
            { batchId: 'R001', sku: 'RET-01', name: 'MAAM CREMA PRENATAL', quantity: 50, condition: 'GOOD' }
        ],
        valuation: 850000,
        created_at: Date.now() - 43200000, // 12 hours ago
        updated_at: Date.now() - 43200000
    },
    // OUTBOUND to Sucursal Norte
    {
        id: 'SHP-003',
        type: 'INTERNAL_TRANSFER',
        origin_location_id: 'SUCURSAL_CENTRO',
        destination_location_id: 'SUCURSAL_NORTE',
        status: 'IN_TRANSIT',
        transport_data: {
            carrier: 'FLOTA_PROPIA',
            tracking_number: 'FP-2024-003',
            package_count: 1,
            driver_name: 'Carlos Muñoz'
        },
        documentation: {
            dispatch_guide_url: '/docs/guide-003.pdf',
            evidence_photos: []
        },
        items: [
            { batchId: 'P002', sku: '780002', name: 'LOSARTÁN 50MG', quantity: 100, condition: 'GOOD' }
        ],
        valuation: 299000,
        created_at: Date.now() - 7200000, // 2 hours ago
        updated_at: Date.now() - 7200000
    },
    // RETURN (Logística Inversa)
    {
        id: 'SHP-004',
        type: 'RETURN',
        origin_location_id: 'SUCURSAL_CENTRO',
        destination_location_id: 'BODEGA_CENTRAL',
        status: 'PREPARING',
        transport_data: {
            carrier: 'STARKEN',
            tracking_number: 'STK-RET-001',
            package_count: 1,
        },
        documentation: {
            evidence_photos: []
        },
        items: [
            { batchId: 'G001', sku: 'LC-001', name: 'ACICLOVIR 200MG', quantity: 20, condition: 'DAMAGED' }
        ],
        valuation: 43340,
        created_at: Date.now() - 3600000, // 1 hour ago
        updated_at: Date.now() - 3600000
    }
];

interface PharmaState {
    // Auth
    user: EmployeeProfile | null;
    employees: EmployeeProfile[]; // Store loaded employees
    login: (userId: string, pin: string) => boolean;
    logout: () => void;

    // Data Sync
    isLoading: boolean;
    syncData: () => Promise<void>;

    // Inventory
    inventory: InventoryBatch[];
    suppliers: Supplier[];
    supplierDocuments: SupplierDocument[];
    purchaseOrders: PurchaseOrder[];
    updateStock: (batchId: string, quantity: number) => void;
    addStock: (batchId: string, quantity: number, expiry?: number) => void;
    addNewProduct: (product: InventoryBatch) => void;
    transferStock: (batchId: string, targetLocation: 'BODEGA_CENTRAL' | 'SUCURSAL_CENTRO' | 'SUCURSAL_NORTE' | 'KIOSCO', quantity: number) => void;
    addPurchaseOrder: (po: PurchaseOrder) => void;
    receivePurchaseOrder: (poId: string, receivedItems: { sku: string, received_qty: number }[]) => void;

    // SRM Actions
    addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
    updateSupplier: (id: string, data: Partial<Supplier>) => void;
    addSupplierDocument: (doc: Omit<SupplierDocument, 'id'>) => void;

    // POS & Cart
    cart: CartItem[];
    currentCustomer: Customer | null;
    setCustomer: (customer: Customer | null) => void;
    addToCart: (batch: InventoryBatch, quantity: number) => void;
    addManualItem: (item: { description: string, price: number, quantity: number, sku?: string, is_fractional?: boolean, original_name?: string, active_ingredients?: string[] }) => void;
    removeFromCart: (sku: string) => void;
    clearCart: () => void;
    processSale: (paymentMethod: string, customer?: Customer) => Promise<boolean>;

    // Inventory Actions
    updateProduct: (id: string, data: Partial<InventoryBatch>) => void;
    updateBatchDetails: (productId: string, batchId: string, data: Partial<InventoryBatch>) => void;

    // Printer & Hardware
    printerConfig: PrinterConfig;
    updatePrinterConfig: (config: Partial<PrinterConfig>) => void;

    // CRM
    customers: Customer[];
    addCustomer: (customer: Omit<Customer, 'id' | 'totalPoints' | 'lastVisit' | 'health_tags' | 'name' | 'age'>) => Customer;
    updateCustomer: (id: string, data: Partial<Customer>) => void;

    // BI & Reports
    salesHistory: SaleTransaction[];
    expenses: Expense[];
    addExpense: (expense: Omit<Expense, 'id'>) => void;

    // Cash Management
    currentShift: CashShift | null;
    dailyShifts: CashShift[]; // History of shifts for the day
    cashMovements: CashMovement[];
    openShift: (amount: number, authorizedBy: string) => void;
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

    // Attendance & HR
    attendanceLogs: AttendanceLog[];
    registerAttendance: (employeeId: string, type: AttendanceType, observation?: string, evidence_photo_url?: string) => void;
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

    // Import
    importInventory: (items: InventoryBatch[]) => void;

    // Queue
    tickets: QueueTicket[];
    generateTicket: (rut?: string, branch_id?: string) => QueueTicket;
    callNextTicket: () => QueueTicket | null;

    // SII (Facturación Electrónica)
    siiConfiguration: SiiConfiguration | null;
    siiCafs: SiiCaf[];
    dteDocuments: DteDocument[];
    updateSiiConfiguration: (config: SiiConfiguration) => void;
    addCaf: (caf: Omit<SiiCaf, 'id'>) => void;
    getAvailableFolios: (tipoDte: DteTipo) => number;

    // Marketing
    promotions: Promotion[];
    giftCards: GiftCard[];
    loyaltyRewards: LoyaltyReward[];
    addPromotion: (promo: Promotion) => void;
    togglePromotion: (id: string) => void;
    createGiftCard: (amount: number) => GiftCard;
    redeemGiftCard: (code: string, amount: number) => boolean;
    getGiftCard: (code: string) => GiftCard | undefined;
}


export const usePharmaStore = create<PharmaState>()(
    persist(
        (set, get) => ({
            // --- Auth ---
            user: null, // ALWAYS start logged out - force login
            employees: MOCK_EMPLOYEES,
            login: (userId, pin) => {
                const { employees } = get();
                const employee = employees.find(e => e.id === userId && e.access_pin === pin);
                if (employee) {
                    set({ user: employee });
                    return true;
                }
                return false;
            },
            logout: () => set({ user: null }),

            // --- Data Sync ---
            isLoading: false,
            syncData: async () => {
                set({ isLoading: true });
                try {
                    const [inventory, employees] = await Promise.all([
                        fetchInventory(),
                        fetchEmployees()
                    ]);

                    // Si falla la DB (Safe Mode devuelve []), mantenemos lo que haya o usamos un fallback mínimo si está vacío
                    if (inventory.length > 0) set({ inventory });
                    if (employees.length > 0) set({ employees });

                    const state = get();

                    // Initialize TigerDataService with current store data
                    const { TigerDataService } = await import('../../domain/services/TigerDataService');
                    TigerDataService.initializeStorage({
                        products: state.inventory,
                        employees: state.employees,
                        sales: state.salesHistory,
                        cashMovements: state.cashMovements,
                        expenses: state.expenses
                    });

                    // ✅ Data Synced & Tiger Data Initialized
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

            // --- Inventory ---
            inventory: MOCK_INVENTORY, // Start with real data
            suppliers: MOCK_SUPPLIERS,
            supplierDocuments: [],
            purchaseOrders: [],
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
            transferStock: (batchId, targetLocation, quantity) => set((state) => {
                const sourceItem = state.inventory.find(i => i.id === batchId);
                if (!sourceItem || sourceItem.stock_actual < quantity) return state;

                // 1. Deduct from source
                const updatedInventory = state.inventory.map(i =>
                    i.id === batchId ? { ...i, stock_actual: i.stock_actual - quantity } : i
                );

                // 2. Add to target (Find existing batch in target location or create new)
                // For simplicity in this demo, we'll clone the item with new location
                // In a real DB, we'd check if SKU exists in target location
                const existingInTarget = updatedInventory.find(i => i.sku === sourceItem.sku && i.location_id === targetLocation);

                if (existingInTarget) {
                    existingInTarget.stock_actual += quantity;
                } else {
                    updatedInventory.push({
                        ...sourceItem,
                        id: `TRF - ${Date.now()} `,
                        location_id: targetLocation,
                        stock_actual: quantity
                    });
                }

                return { inventory: updatedInventory };
            }),
            addPurchaseOrder: (po) => set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] })),
            receivePurchaseOrder: (poId, receivedItems) => set((state) => {
                // 1. Actualizar estado de la PO
                const updatedPOs = state.purchaseOrders.map(po =>
                    po.id === poId ? { ...po, status: 'COMPLETED' as const } : po
                );

                // 2. Actualizar Inventario
                const updatedInventory = [...state.inventory];
                receivedItems.forEach(rec => {
                    const itemIndex = updatedInventory.findIndex(i => i.sku === rec.sku);
                    if (itemIndex >= 0) {
                        updatedInventory[itemIndex] = {
                            ...updatedInventory[itemIndex],
                            stock_actual: updatedInventory[itemIndex].stock_actual + rec.received_qty
                        };
                    }
                });

                return { purchaseOrders: updatedPOs, inventory: updatedInventory };
            }),

            // --- SRM Actions ---
            addSupplier: (supplierData) => set((state) => ({
                suppliers: [...state.suppliers, { ...supplierData, id: `SUP - ${Date.now()} ` }]
            })),
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

            // Actions Implementation
            setCustomer: (customer) => set({ currentCustomer: customer }),
            // --- ACTIONS ---
            updateProduct: (id: string, data: Partial<InventoryBatch>) => set((state) => ({
                inventory: state.inventory.map(item =>
                    item.id === id ? { ...item, ...data } : item
                )
            })),

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
                        customer: customer || undefined
                    };

                    // 2. CRITICAL: Save to Tiger Data BEFORE clearing cart
                    const { TigerDataService } = await import('../../domain/services/TigerDataService');
                    const result = await TigerDataService.saveSaleTransaction(
                        saleTransaction,
                        'SUCURSAL_CENTRO' // TODO: Get from location context
                    );

                    if (!result.success) {
                        console.error('❌ Failed to save sale to Tiger Data');
                        return false;
                    }

                    // ✅ Sale saved to Tiger Data

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
                        const pointsEarned = Math.floor(saleTransaction.total * 0.01); // 1% points
                        state.updateCustomer(customer.id, {
                            totalPoints: customer.totalPoints + pointsEarned,
                            lastVisit: Date.now()
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
                { id: 'C-001', rut: '11.111.111-1', fullName: 'Cliente Frecuente Demo', name: 'Cliente Frecuente Demo', phone: '+56912345678', email: 'demo@cliente.cl', totalPoints: 1500, registrationSource: 'ADMIN', lastVisit: Date.now() - 86400000, age: 45, health_tags: ['HYPERTENSION'] }
            ],
            addCustomer: (data) => {
                const newCustomer: Customer = {
                    ...data,
                    id: `CUST - ${Date.now()} `,
                    totalPoints: 0,
                    lastVisit: Date.now(),
                    health_tags: [],
                    name: data.fullName, // Legacy support
                    age: 0 // Default
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


            // --- Cash Management ---
            currentShift: null,
            dailyShifts: [],
            cashMovements: [],
            openShift: (amount, authorizedBy) => set((state) => {
                if (state.currentShift?.status === 'OPEN') return state;

                // Calculate shift number (1-based)
                const todayStart = new Date().setHours(0, 0, 0, 0);
                const shiftsToday = state.dailyShifts.filter(s => s.start_time >= todayStart).length;

                const newShift: CashShift = {
                    id: `SHIFT - ${Date.now()} `,
                    user_id: state.user?.id || 'UNKNOWN',
                    start_time: Date.now(),
                    opening_amount: amount,
                    status: 'OPEN',
                    openedBy: state.user?.id || 'UNKNOWN',
                    authorizedBy: authorizedBy,
                    shiftNumber: shiftsToday + 1
                };
                return { currentShift: newShift };
            }),
            closeShift: (finalAmount, authorizedBy) => set((state) => {
                if (!state.currentShift) return state;
                const metrics = state.getShiftMetrics();

                const closedShift: CashShift = {
                    ...state.currentShift,
                    end_time: Date.now(),
                    status: 'CLOSED',
                    closedBy: authorizedBy,
                    closing_amount: finalAmount,
                    difference: finalAmount - metrics.expectedCash
                };

                return {
                    currentShift: null, // Reset current shift
                    dailyShifts: [...state.dailyShifts, closedShift], // Archive it
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

            // --- Attendance ---
            attendanceLogs: [],
            registerAttendance: (employeeId: string, type: AttendanceType, observation?: string, evidence_photo_url?: string) => set((state) => {
                const now = Date.now();
                let newStatus: AttendanceStatus = 'OUT';

                if (['CHECK_IN', 'BREAK_END', 'PERMISSION_END'].includes(type)) newStatus = 'IN';
                if (type === 'BREAK_START') newStatus = 'LUNCH';
                if (type === 'PERMISSION_START') newStatus = 'ON_PERMISSION';
                if (['CHECK_OUT', 'MEDICAL_LEAVE', 'EMERGENCY', 'WORK_ACCIDENT'].includes(type)) newStatus = 'OUT';

                // Calculate overtime if CHECK_OUT
                let overtime = 0;
                if (type === 'CHECK_OUT') {
                    // Simple logic: find last CHECK_IN today
                    const todayStart = new Date().setHours(0, 0, 0, 0);
                    const lastCheckIn = state.attendanceLogs.find(l => l.employee_id === employeeId && l.type === 'CHECK_IN' && l.timestamp >= todayStart);

                    if (lastCheckIn) {
                        const workedMinutes = (now - lastCheckIn.timestamp) / 1000 / 60;
                        const contractMinutes = 9 * 60; // 9 hours default
                        if (workedMinutes > contractMinutes) {
                            overtime = Math.round(workedMinutes - contractMinutes);
                        }
                    }
                }

                // WORK ACCIDENT ALERT
                if (type === 'WORK_ACCIDENT') {
                    // In a real app, this would trigger an email/SMS
                    console.error('🚨 ALERTA DE ACCIDENTE LABORAL:', employeeId, observation);
                    // We could also add a notification to a notifications store if we had one
                }

                const newLog: AttendanceLog = {
                    id: `LOG - ${now} `,
                    employee_id: employeeId,
                    timestamp: now,
                    type,
                    overtime_minutes: overtime,
                    observation,
                    evidence_photo_url
                };

                return {
                    attendanceLogs: [...state.attendanceLogs, newLog],
                    employees: state.employees.map(emp =>
                        emp.id === employeeId ? { ...emp, current_status: newStatus } : emp
                    )
                };
            }),
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

            createDispatch: (shipmentData) => set((state) => {
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

                // Deduct stock from Origin
                const updatedInventory = [...state.inventory];
                shipmentData.items.forEach(item => {
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
                    inventory: updatedInventory
                };
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
            addTicketToQueue: (ticket: QueueTicket) => set((state) => ({
                tickets: [...state.tickets, ticket]
            })),
            generateTicket: (rut = 'ANON', branch_id = 'SUC-CENTRO') => {
                const ticket: QueueTicket = {
                    id: `T - ${Date.now()} `,
                    number: `A - ${Math.floor(Math.random() * 100)} `,
                    status: 'WAITING',
                    rut,
                    timestamp: Date.now(),
                    branch_id // Default, should be dynamic in real app
                };
                set((state) => ({ tickets: [...state.tickets, ticket] }));
                return ticket;
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
            }
        }),
        {
            name: 'farmacias-vallenar-v6-prices', // Force cache clear - Price Structure Update
            version: 6,
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
