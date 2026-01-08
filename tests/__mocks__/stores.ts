/**
 * Mock Stores for Testing
 * 
 * Provides mock implementations of Zustand stores used by hooks
 */

import { vi } from 'vitest';
import { CartItem, InventoryBatch, Customer, CashShift, EmployeeProfile } from '@/domain/types';

// =====================================================
// MOCK DATA
// =====================================================

export const mockInventory: InventoryBatch[] = [
    {
        id: 'prod-1',
        sku: 'SKU001',
        name: 'Paracetamol 500mg',
        barcode: '7891234567890',
        dci: 'paracetamol',
        price: 1500,
        stock_actual: 100,
        expiry_date: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        is_fractionable: false,
        condition: 'VD',
        lot_number: 'BATCH001',
        location_id: 'loc-1',
        concentration: '500mg',
        unit_count: 1,
        is_generic: true,
        bioequivalent_status: 'BIOEQUIVALENTE',
        brand: 'Generico',
        administration_route: 'ORAL',
        stock_min: 10,
        stock_max: 1000,
        cost_net: 1000,
        cost_price: 1000,
        tax_percent: 19,
        price_sell_box: 1500,
        price_sell_unit: 1500,
        category: 'MEDICAMENTO',
        allows_commission: false,
        active_ingredients: ['Paracetamol'],
        safety_stock: 5,
        lead_time_days: 2
    },
    {
        id: 'prod-2',
        sku: 'SKU002',
        name: 'Ibuprofeno 400mg',
        barcode: '7891234567891',
        dci: 'ibuprofeno',
        price: 2500,
        stock_actual: 50,
        expiry_date: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
        is_fractionable: true,
        condition: 'VD',
        lot_number: 'BATCH002',
        location_id: 'loc-1',
        concentration: '400mg',
        unit_count: 1,
        is_generic: true,
        bioequivalent_status: 'BIOEQUIVALENTE',
        brand: 'Generico',
        administration_route: 'ORAL',
        stock_min: 10,
        stock_max: 1000,
        cost_net: 1500,
        cost_price: 1500,
        tax_percent: 19,
        price_sell_box: 2500,
        price_sell_unit: 2500,
        category: 'MEDICAMENTO',
        allows_commission: false,
        active_ingredients: ['Ibuprofeno'],
        safety_stock: 5,
        lead_time_days: 2
    },
    {
        id: 'prod-3',
        sku: 'SKU003',
        name: 'Amoxicilina 500mg',
        barcode: '7891234567892',
        dci: 'amoxicilina',
        price: 3500,
        stock_actual: 0, // Out of stock
        expiry_date: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days - expires sooner
        is_fractionable: false,
        condition: 'R', // Restricted
        lot_number: 'BATCH003',
        location_id: 'loc-1',
        concentration: '500mg',
        unit_count: 1,
        is_generic: true,
        bioequivalent_status: 'BIOEQUIVALENTE',
        brand: 'Generico',
        administration_route: 'ORAL',
        stock_min: 10,
        stock_max: 1000,
        cost_net: 2000,
        cost_price: 2000,
        tax_percent: 19,
        price_sell_box: 3500,
        price_sell_unit: 3500,
        category: 'MEDICAMENTO',
        allows_commission: false,
        active_ingredients: ['Amoxicilina'],
        safety_stock: 5,
        lead_time_days: 2
    },
];

export const mockCartItems: CartItem[] = [
    {
        id: 'prod-1',
        sku: 'SKU001',
        name: 'Paracetamol 500mg',
        price: 1500,
        quantity: 2,
    },
    {
        id: 'prod-2',
        sku: 'SKU002',
        name: 'Ibuprofeno 400mg',
        price: 2500,
        quantity: 1,
    },
];

export const mockCustomer: Customer = {
    id: 'cust-1',
    fullName: 'Juan Pérez',
    rut: '12345678-9',
    email: 'juan@example.com',
    phone: '+56912345678',
    totalPoints: 500,
    registrationSource: 'POS',
    lastVisit: Date.now(),
    total_spent: 10000,
    tags: [],
    status: 'ACTIVE',
    name: 'Juan Pérez',
    age: 30,
    health_tags: []
};

export const mockShift: CashShift = {
    id: 'shift-1',
    user_id: 'user-1',
    openedBy: 'user-1',
    shiftNumber: 1,
    status: 'OPEN',
    opening_amount: 50000,
    start_time: Date.now() - 3600000, // 1 hour ago
};

export const mockUser: EmployeeProfile = {
    id: 'user-1',
    name: 'Vendedor Test',
    rut: '11111111-1',
    role: 'CASHIER',
    access_pin: '1234',
    status: 'ACTIVE',
    job_title: 'CAJERO_VENDEDOR',
    current_status: 'IN',
};

// =====================================================
// MOCK PHARMA STORE
// =====================================================

export const createMockPharmaStore = (overrides = {}) => ({
    inventory: mockInventory,
    cart: mockCartItems,
    currentCustomer: null as Customer | null,
    currentShift: mockShift,
    user: mockUser,

    // Actions
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    processSale: vi.fn().mockResolvedValue(true),
    redeemPoints: vi.fn().mockReturnValue(true),
    calculateDiscountValue: vi.fn((points: number) => Math.floor(points * 0.1)),
    retrieveQuote: vi.fn().mockResolvedValue(false),

    ...overrides,
});

// =====================================================
// MOCK LOCATION STORE
// =====================================================

export const createMockLocationStore = (overrides = {}) => ({
    currentLocation: {
        id: 'loc-1',
        name: 'Sucursal Centro',
        config: {
            receipt_template: {
                header: 'Farmacia Test',
                footer: 'Gracias por su compra',
            },
        },
    },
    ...overrides,
});

// =====================================================
// MOCK SETTINGS STORE
// =====================================================

export const createMockSettingsStore = (overrides = {}) => ({
    enable_sii_integration: false,
    hardware: {
        printer_type: 'thermal',
        printer_width: 80,
    },
    ...overrides,
});

// =====================================================
// SETUP MOCKS
// =====================================================

export function setupStoreMocks(options: {
    pharmaStore?: Partial<ReturnType<typeof createMockPharmaStore>>;
    locationStore?: Partial<ReturnType<typeof createMockLocationStore>>;
    settingsStore?: Partial<ReturnType<typeof createMockSettingsStore>>;
} = {}) {
    const pharmaStore = createMockPharmaStore(options.pharmaStore);
    const locationStore = createMockLocationStore(options.locationStore);
    const settingsStore = createMockSettingsStore(options.settingsStore);

    vi.mock('@/presentation/store/useStore', () => ({
        usePharmaStore: () => pharmaStore,
    }));

    vi.mock('@/presentation/store/useLocationStore', () => ({
        useLocationStore: () => locationStore,
    }));

    vi.mock('@/presentation/store/useSettingsStore', () => ({
        useSettingsStore: () => settingsStore,
    }));

    return { pharmaStore, locationStore, settingsStore };
}
