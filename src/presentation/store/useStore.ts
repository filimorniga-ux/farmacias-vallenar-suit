
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { InventoryBatch, EmployeeProfile, SaleItem, Customer, QueueTicket, Supplier, PurchaseOrder, CartItem, SaleTransaction, Expense, CashShift, CashMovement, CashMovementReason, AttendanceLog, AttendanceStatus, StockTransfer, WarehouseIncident, SupplierDocument, SiiConfiguration, SiiCaf, DteDocument, DteTipo } from '../../domain/types';
import { fetchInventory, fetchEmployees } from '../../actions/sync';

// --- DATOS REALES FARMACIAS VALLENAR ---
const MOCK_INVENTORY: InventoryBatch[] = [
    // --- TOP VENTAS & CRÓNICOS ---
    { id: 'P001', sku: '780001', name: 'PARACETAMOL 500MG', dci: 'PARACETAMOL', laboratory: 'Lab Chile', condition: 'VD', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'GÓNDOLA', stock_actual: 2000, stock_min: 200, stock_max: 3000, expiry_date: new Date('2026-12-01').getTime(), price: 990, cost_price: 400, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Paracetamol'] },
    { id: 'P002', sku: '780002', name: 'LOSARTÁN 50MG', dci: 'LOSARTÁN POTÁSICO', laboratory: 'Lab Chile', condition: 'R', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A1', stock_actual: 500, stock_min: 100, stock_max: 800, expiry_date: new Date('2025-06-01').getTime(), price: 2990, cost_price: 1000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Losartán Potásico'] },
    { id: 'P003', sku: '780003', name: 'IBUPROFENO 600MG', dci: 'IBUPROFENO', laboratory: 'Lab Chile', condition: 'VD', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A2', stock_actual: 800, stock_min: 100, stock_max: 1200, expiry_date: new Date('2026-01-01').getTime(), price: 1990, cost_price: 600, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Ibuprofeno'] },
    { id: 'P004', sku: '780004', name: 'EUTIROX 100MCG', dci: 'LEVOTIROXINA', laboratory: 'Merck', condition: 'R', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE B1', stock_actual: 150, stock_min: 30, stock_max: 300, expiry_date: new Date('2025-10-01').getTime(), price: 8500, cost_price: 3500, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Levotiroxina'] },

    // --- CONTROLADOS (Receta Retenida / Cheque) ---
    { id: 'C001', sku: 'CTRL-01', name: 'ZOPICLONA 7.5MG', dci: 'ZOPICLONA', laboratory: 'Saval', condition: 'RR', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'SEGURIDAD', stock_actual: 60, stock_min: 20, stock_max: 100, expiry_date: new Date('2025-08-01').getTime(), price: 4500, cost_price: 2000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Zopiclona'] },
    { id: 'C002', sku: 'CTRL-02', name: 'RAVOTRIL 2MG', dci: 'CLONAZEPAM', laboratory: 'Roche', condition: 'RCH', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'CAJA FUERTE', stock_actual: 15, stock_min: 5, stock_max: 30, expiry_date: new Date('2025-12-01').getTime(), price: 12900, cost_price: 6000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Clonazepam'] },
    { id: 'C003', sku: 'CTRL-03', name: 'TRAMADOL GOTAS', dci: 'TRAMADOL', laboratory: 'Mintlab', condition: 'RR', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'SEGURIDAD', stock_actual: 30, stock_min: 10, stock_max: 60, expiry_date: new Date('2026-02-01').getTime(), price: 3500, cost_price: 1500, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Tramadol'] },

    // --- CADENA DE FRÍO ---
    { id: 'F001', sku: 'FRIO-01', name: 'INSULINA NPH', dci: 'INSULINA HUMANA', laboratory: 'Novo Nordisk', condition: 'R', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'REFRI-01', stock_actual: 25, stock_min: 10, stock_max: 50, expiry_date: new Date('2025-04-01').getTime(), price: 15990, cost_price: 8000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Insulina Humana'] },
    { id: 'F002', sku: 'FRIO-02', name: 'INSULINA GLARGINA', dci: 'INSULINA', laboratory: 'Sanofi', condition: 'R', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'REFRI-01', stock_actual: 10, stock_min: 5, stock_max: 25, expiry_date: new Date('2025-05-01').getTime(), price: 25000, cost_price: 12000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Insulina Glargina'] },

    // --- LAB CHILE & GENÉRICOS ---
    { id: 'G001', sku: 'LC-001', name: 'ACICLOVIR 200MG', dci: 'ACICLOVIR', laboratory: 'Lab Chile', condition: 'R', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'GENERICOS-A', stock_actual: 100, stock_min: 20, stock_max: 200, expiry_date: new Date('2026-03-01').getTime(), price: 2167, cost_price: 800, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Aciclovir'] },
    { id: 'G002', sku: 'LC-002', name: 'NAPROXENO 550MG', dci: 'NAPROXENO', laboratory: 'Lab Chile', condition: 'VD', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'GENERICOS-N', stock_actual: 120, stock_min: 30, stock_max: 250, expiry_date: new Date('2026-07-01').getTime(), price: 1208, cost_price: 500, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Naproxeno'] },
    { id: 'G003', sku: 'LC-003', name: 'OMEPRAZOL 20MG', dci: 'OMEPRAZOL', laboratory: 'Lab Chile', condition: 'VD', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'GENERICOS-O', stock_actual: 500, stock_min: 100, stock_max: 800, expiry_date: new Date('2026-09-01').getTime(), price: 893, cost_price: 350, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Omeprazol'] },
    { id: 'G004', sku: 'LC-004', name: 'KITADOL 1000MG', dci: 'PARACETAMOL', laboratory: 'Lab Chile', condition: 'VD', is_bioequivalent: true, location_id: 'SUCURSAL_CENTRO', aisle: 'INFANTIL', stock_actual: 80, stock_min: 20, stock_max: 150, expiry_date: new Date('2026-01-01').getTime(), price: 5295, cost_price: 2000, category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Paracetamol'] },

    // --- RETAIL & COMISIONABLES (LEY ANTI-CANELA: TRUE) ---
    { id: 'R001', sku: 'RET-01', name: 'MAAM CREMA PRENATAL', dci: 'COSMETICO', laboratory: 'Maam', brand: 'Maam', condition: 'VD', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'BELLEZA', stock_actual: 40, stock_min: 10, stock_max: 80, expiry_date: new Date('2027-01-01').getTime(), price: 15847, cost_price: 8000, category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [], image_url: '/images/maam.jpg' },
    { id: 'R002', sku: 'RET-02', name: 'SIMILAC 1 FÓRMULA', dci: 'ALIMENTO', laboratory: 'Abbott', brand: 'Similac', condition: 'VD', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'MATERNIDAD', stock_actual: 20, stock_min: 5, stock_max: 50, expiry_date: new Date('2025-02-01').getTime(), price: 22990, cost_price: 12000, category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [] },
    { id: 'R003', sku: 'RET-03', name: 'EUCERIN PROTECTOR 50+', dci: 'COSMETICO', laboratory: 'Eucerin', brand: 'Eucerin', condition: 'VD', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'SOLARES', stock_actual: 30, stock_min: 5, stock_max: 60, expiry_date: new Date('2027-05-01').getTime(), price: 18990, cost_price: 10000, category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [] },
    { id: 'R004', sku: 'RET-04', name: 'LAUNOL SHAMPOO', dci: 'PEDICULICIDA', laboratory: 'Launol', brand: 'Launol', condition: 'VD', is_bioequivalent: false, location_id: 'SUCURSAL_CENTRO', aisle: 'CAPILAR', stock_actual: 25, stock_min: 5, stock_max: 50, expiry_date: new Date('2026-11-01').getTime(), price: 5528, cost_price: 2500, category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [] }
];

const MOCK_EMPLOYEES: EmployeeProfile[] = [
    {
        id: 'EMP-001',
        rut: '11.111.111-1',
        name: 'Miguel Pérez',
        role: 'MANAGER',
        access_pin: '0000',
        status: 'ACTIVE',
        current_status: 'OUT',
        job_title: 'Gerente General',
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
        access_pin: '1234',
        status: 'ACTIVE',
        current_status: 'OUT',
        job_title: 'Director Técnico',
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
        access_pin: '1111',
        status: 'ACTIVE',
        current_status: 'OUT',
        job_title: 'Cajero Vendedor',
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
        access_pin: '2222',
        status: 'ACTIVE',
        current_status: 'OUT',
        job_title: 'Asistente de Bodega',
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
        bank_account: { bank: 'Banco de Chile', account_type: 'CORRIENTE', account_number: '111-222-333', email_notification: 'pagos@labchile.cl' }
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
        rating: 4
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
        rating: 3
    },
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
    addManualItem: (item: { description: string, price: number, quantity: number }) => void;
    removeFromCart: (sku: string) => void;
    clearCart: () => void;
    processSale: (paymentMethod: string, customer?: Customer) => void;

    // CRM
    customers: Customer[];
    addCustomer: (customer: Omit<Customer, 'id' | 'totalPoints' | 'lastVisit' | 'name' | 'age' | 'health_tags'>) => Customer;
    updateCustomer: (id: string, data: Partial<Customer>) => void;

    // BI & Reports
    salesHistory: SaleTransaction[];
    expenses: Expense[];
    addExpense: (expense: Omit<Expense, 'id'>) => void;

    // Cash Management
    currentShift: CashShift | null;
    cashMovements: CashMovement[];
    openShift: (amount: number) => void;
    closeShift: (finalAmount: number) => void;
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
    registerAttendance: (employeeId: string, type: AttendanceLog['type']) => void;
    updateEmployeeBiometrics: (employeeId: string, credentialId: string) => void;

    // WMS & Logistics
    stockTransfers: StockTransfer[];
    warehouseIncidents: WarehouseIncident[];
    dispatchTransfer: (transfer: Omit<StockTransfer, 'id' | 'status' | 'timeline'>) => void;
    receiveTransfer: (transferId: string, incidents?: Omit<WarehouseIncident, 'id' | 'transfer_id' | 'reported_at' | 'status'>[]) => void;

    // Queue
    tickets: QueueTicket[];
    generateTicket: (rut?: string) => QueueTicket;
    callNextTicket: () => QueueTicket | null;

    // SII (Facturación Electrónica)
    siiConfiguration: SiiConfiguration | null;
    siiCafs: SiiCaf[];
    dteDocuments: DteDocument[];
    updateSiiConfiguration: (config: SiiConfiguration) => void;
    addCaf: (caf: Omit<SiiCaf, 'id'>) => void;
    getAvailableFolios: (tipoDte: DteTipo) => number;
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

                    console.log('Data Synced:', { inventoryCount: inventory.length, employeeCount: employees.length });
                } catch (error) {
                    console.error('Sync failed:', error);
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
                inventory: [...state.inventory, { ...product, id: `BATCH-${Date.now()}` }]
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
                        id: `TRF-${Date.now()}`,
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
                suppliers: [...state.suppliers, { ...supplierData, id: `SUP-${Date.now()}` }]
            })),
            updateSupplier: (id, data) => set((state) => ({
                suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s)
            })),
            addSupplierDocument: (docData) => set((state) => ({
                supplierDocuments: [...state.supplierDocuments, { ...docData, id: `DOC-${Date.now()}` }]
            })),

            // --- POS ---
            cart: [],
            currentCustomer: null,
            setCustomer: (customer) => set({ currentCustomer: customer }),
            addToCart: (batch, quantity) => set((state) => {
                const existingItem = state.cart.find(i => i.sku === batch.sku);
                if (existingItem) {
                    return {
                        cart: state.cart.map(i => i.sku === batch.sku ? { ...i, quantity: i.quantity + quantity } : i)
                    };
                }
                return {
                    cart: [...state.cart, {
                        id: batch.id,
                        batch_id: batch.id,
                        sku: batch.sku,
                        name: batch.name,
                        price: batch.price,
                        quantity: quantity,
                        allows_commission: batch.allows_commission,
                        active_ingredients: batch.active_ingredients
                    }]
                };
            }),
            addManualItem: (item) => set((state) => ({
                cart: [...state.cart, {
                    id: 'MANUAL-' + Date.now(),
                    batch_id: 'MANUAL',
                    sku: 'MANUAL-SKU', // Generic SKU as requested
                    name: item.description,
                    price: item.price,
                    quantity: item.quantity,
                    allows_commission: true, // Usually manual items like services allow commission or are neutral
                    active_ingredients: []
                }]
            })),
            removeFromCart: (sku) => set((state) => ({
                cart: state.cart.filter(i => i.sku !== sku)
            })),
            clearCart: () => set({ cart: [] }),
            processSale: (paymentMethod, customer) => {
                const state = get();
                // 1. Descontar Stock
                const newInventory = state.inventory.map(item => {
                    const cartItem = state.cart.find(c => c.sku === item.sku);
                    if (cartItem) {
                        return { ...item, stock_actual: item.stock_actual - cartItem.quantity };
                    }
                    return item;
                });

                // Update customer points and last visit if applicable
                if (customer) {
                    const pointsEarned = Math.floor(state.cart.reduce((a, b) => a + b.price * b.quantity, 0) * 0.01); // 1% points
                    state.updateCustomer(customer.id, {
                        totalPoints: customer.totalPoints + pointsEarned,
                        lastVisit: Date.now()
                    });
                }

                console.log('Venta Procesada:', { items: state.cart, total: state.cart.reduce((a, b) => a + b.price * b.quantity, 0), paymentMethod, customer });

                const saleTransaction: SaleTransaction = {
                    id: `SALE-${Date.now()}`,
                    timestamp: Date.now(),
                    items: state.cart.map(item => ({
                        batch_id: item.batch_id || 'UNKNOWN',
                        sku: item.sku,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        allows_commission: item.allows_commission || false,
                        active_ingredients: item.active_ingredients
                    })),
                    total: state.cart.reduce((a, b) => a + b.price * b.quantity, 0),
                    payment_method: paymentMethod as any,
                    seller_id: state.user?.id || 'UNKNOWN',
                    customer: customer || undefined
                };

                set({
                    inventory: newInventory,
                    cart: [],
                    currentCustomer: null,
                    salesHistory: [...state.salesHistory, saleTransaction]
                }); // Clear customer after sale
            },

            // --- CRM ---
            customers: [
                { id: 'C-001', rut: '11.111.111-1', fullName: 'Cliente Frecuente Demo', name: 'Cliente Frecuente Demo', phone: '+56912345678', email: 'demo@cliente.cl', totalPoints: 1500, registrationSource: 'ADMIN', lastVisit: Date.now() - 86400000, age: 45, health_tags: ['HYPERTENSION'] }
            ],
            addCustomer: (data) => {
                const newCustomer: Customer = {
                    id: `C-${Date.now()}`,
                    ...data,
                    name: data.fullName, // Alias
                    totalPoints: 0,
                    lastVisit: Date.now(),
                    age: 0, // Default
                    health_tags: [] // Default
                };
                set((state) => ({ customers: [...state.customers, newCustomer] }));
                return newCustomer;
            },
            updateCustomer: (id, data) => set((state) => ({
                customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c)
            })),

            // --- BI & Reports ---
            salesHistory: [],
            expenses: [],
            addExpense: (expense) => set((state) => ({
                expenses: [...state.expenses, { ...expense, id: `EXP-${Date.now()}` }]
            })),

            // --- Cash Management ---
            currentShift: null,
            cashMovements: [],
            openShift: (amount) => set((state) => {
                if (state.currentShift?.status === 'OPEN') return state;
                const newShift: CashShift = {
                    id: `SHIFT-${Date.now()}`,
                    user_id: state.user?.id || 'UNKNOWN',
                    start_time: Date.now(),
                    opening_amount: amount,
                    status: 'OPEN'
                };
                return { currentShift: newShift };
            }),
            closeShift: (finalAmount) => set((state) => {
                if (!state.currentShift) return state;
                const metrics = state.getShiftMetrics();
                return {
                    currentShift: {
                        ...state.currentShift,
                        end_time: Date.now(),
                        status: 'CLOSED',
                        closing_amount: finalAmount,
                        difference: finalAmount - metrics.expectedCash
                    }
                };
            }),
            registerCashMovement: (movement) => set((state) => {
                if (!state.currentShift) return state;
                const newMovement: CashMovement = {
                    id: `MOV-${Date.now()}`,
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
                const cashSales = shiftSales.filter(s => s.payment_method === 'CASH').reduce((sum, s) => sum + s.total, 0);
                const cardSales = shiftSales.filter(s => s.payment_method === 'DEBIT' || s.payment_method === 'CREDIT').reduce((sum, s) => sum + s.total, 0);
                const transferSales = shiftSales.filter(s => s.payment_method === 'TRANSFER').reduce((sum, s) => sum + s.total, 0);

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
                    expectedCash
                };
            },

            // --- Attendance ---
            attendanceLogs: [],
            registerAttendance: (employeeId, type) => set((state) => {
                const now = Date.now();
                let newStatus: AttendanceStatus = 'OUT';

                if (type === 'CHECK_IN' || type === 'LUNCH_END') newStatus = 'IN';
                if (type === 'LUNCH_START') newStatus = 'LUNCH';
                if (type === 'CHECK_OUT') newStatus = 'OUT';

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

                const newLog: AttendanceLog = {
                    id: `LOG-${now}`,
                    employee_id: employeeId,
                    timestamp: now,
                    type,
                    overtime_minutes: overtime > 0 ? overtime : undefined
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
            warehouseIncidents: [],
            dispatchTransfer: (transferData) => set((state) => {
                const now = Date.now();
                const newTransfer: StockTransfer = {
                    ...transferData,
                    id: `TRF-${now}`,
                    status: 'IN_TRANSIT',
                    timeline: { created_at: now, dispatched_at: now }
                };

                // Move stock to TRANSIT
                const updatedInventory = [...state.inventory];

                transferData.items.forEach(item => {
                    const batchIndex = updatedInventory.findIndex(b => b.id === item.batchId);
                    if (batchIndex !== -1) {
                        // Deduct from origin
                        updatedInventory[batchIndex] = {
                            ...updatedInventory[batchIndex],
                            stock_actual: updatedInventory[batchIndex].stock_actual - item.quantity
                        };

                        // Add to TRANSIT
                        updatedInventory.push({
                            ...updatedInventory[batchIndex],
                            id: `TRANSIT-${item.batchId}-${now}`,
                            location_id: 'TRANSIT',
                            stock_actual: item.quantity,
                            stock_min: 0,
                            stock_max: 0
                        });
                    }
                });

                return {
                    stockTransfers: [...state.stockTransfers, newTransfer],
                    inventory: updatedInventory
                };
            }),
            receiveTransfer: (transferId, incidents) => set((state) => {
                const now = Date.now();
                const transfer = state.stockTransfers.find(t => t.id === transferId);
                if (!transfer) return {};

                let updatedInventory = [...state.inventory];
                const newIncidents: WarehouseIncident[] = [];

                // Move stock from TRANSIT to Destination
                transfer.items.forEach(item => {
                    const transitBatchIndex = updatedInventory.findIndex(b =>
                        b.sku === item.sku &&
                        b.location_id === 'TRANSIT' &&
                        b.stock_actual >= item.quantity
                    );

                    if (transitBatchIndex !== -1) {
                        // Remove from TRANSIT
                        updatedInventory[transitBatchIndex] = {
                            ...updatedInventory[transitBatchIndex],
                            stock_actual: updatedInventory[transitBatchIndex].stock_actual - item.quantity
                        };

                        // Add to Destination
                        const destBatchIndex = updatedInventory.findIndex(b =>
                            b.sku === item.sku &&
                            b.location_id === transfer.destination_location_id
                        );

                        if (destBatchIndex !== -1) {
                            updatedInventory[destBatchIndex] = {
                                ...updatedInventory[destBatchIndex],
                                stock_actual: updatedInventory[destBatchIndex].stock_actual + item.quantity
                            };
                        } else {
                            // Create new batch at destination
                            updatedInventory.push({
                                ...updatedInventory[transitBatchIndex],
                                id: `BATCH-${now}-${Math.random()}`,
                                location_id: transfer.destination_location_id,
                                stock_actual: item.quantity,
                                stock_min: 10,
                                stock_max: 100
                            });
                        }
                    }
                });

                // Register Incidents
                if (incidents && incidents.length > 0) {
                    incidents.forEach(inc => {
                        newIncidents.push({
                            ...inc,
                            id: `INC-${now}-${Math.random()}`,
                            transfer_id: transferId,
                            status: 'OPEN',
                            reported_at: now
                        });
                    });
                }

                return {
                    stockTransfers: state.stockTransfers.map(t =>
                        t.id === transferId
                            ? { ...t, status: incidents?.length ? 'DISPUTED' : 'RECEIVED', timeline: { ...t.timeline, received_at: now } }
                            : t
                    ),
                    inventory: updatedInventory,
                    warehouseIncidents: [...state.warehouseIncidents, ...newIncidents]
                };
            }),

            // --- Queue ---
            tickets: [],
            generateTicket: (rut) => {
                const state = get();
                // Check if customer exists to personalize ticket
                // const customer = rut ? state.customers.find(c => c.rut === rut) : null;

                const newTicket: QueueTicket = {
                    id: Math.random().toString(36).substr(2, 9),
                    number: `A-${String(state.tickets.length + 1).padStart(3, '0')}`,
                    status: 'WAITING',
                    rut,
                    timestamp: Date.now()
                };

                set((state) => ({ tickets: [...state.tickets, newTicket] }));
                return newTicket;
            },
            callNextTicket: () => {
                const state = get();
                const nextTicket = state.tickets.find(t => t.status === 'WAITING');
                if (nextTicket) {
                    set((state) => ({
                        tickets: state.tickets.map(t => t.id === nextTicket.id ? { ...t, status: 'CALLING' } : t)
                    }));
                    return nextTicket;
                }
                return null;
            },

            // --- SII ---
            siiConfiguration: null,
            siiCafs: [],
            dteDocuments: [],
            updateSiiConfiguration: (config) => set({ siiConfiguration: config }),
            addCaf: (cafData) => set((state) => ({
                siiCafs: [...state.siiCafs, { ...cafData, id: `CAF-${Date.now()}` }]
            })),
            getAvailableFolios: (tipoDte) => {
                const state = get();
                const caf = state.siiCafs.find(c => c.tipo_dte === tipoDte && c.active);
                if (!caf) return 0;
                return (caf.rango_hasta - caf.rango_desde) - caf.folios_usados;
            }
        }),
        {
            name: 'farmacias-vallenar-v4-fix', // Force cache clear - fix auto-login & empty inventory
            version: 4,
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
