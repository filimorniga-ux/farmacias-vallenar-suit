/**
 * Test Fixtures - Reusable Mock Data for Tests
 * Pharma-Synapse v3.3
 * 
 * These fixtures provide consistent, realistic test data
 * that matches the database schema and business rules.
 */

import { randomUUID } from 'crypto';

// =====================================================
// CONSTANTS
// =====================================================

export const TEST_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440000';
export const TEST_WAREHOUSE_ID = '550e8400-e29b-41d4-a716-446655440001';
export const TEST_TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440002';
export const TEST_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440003';
export const TEST_BATCH_ID = '550e8400-e29b-41d4-a716-446655440004';
export const TEST_SESSION_ID = '550e8400-e29b-41d4-a716-446655440005';

// Pre-hashed PIN "1234" with bcrypt (cost 10)
export const TEST_PIN_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqSqtVNVlKzVVjLfmJgdgjGXkCXIe';
export const TEST_PIN_PLAIN = '1234';

// =====================================================
// USER FIXTURES
// =====================================================

export interface UserFixture {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE' | 'QF';
    access_pin_hash: string;
    access_pin?: string;
    is_active: boolean;
    location_id: string;
}

export const createUserFixture = (overrides: Partial<UserFixture> = {}): UserFixture => ({
    id: randomUUID(),
    name: 'Test User',
    email: 'test@farmaciasvallenar.cl',
    role: 'CASHIER',
    access_pin_hash: TEST_PIN_HASH,
    is_active: true,
    location_id: TEST_LOCATION_ID,
    ...overrides
});

export const TEST_USERS = {
    admin: createUserFixture({
        id: '550e8400-e29b-41d4-a716-446655440010',
        name: 'Admin Test',
        email: 'admin@test.cl',
        role: 'ADMIN'
    }),
    manager: createUserFixture({
        id: '550e8400-e29b-41d4-a716-446655440011',
        name: 'Manager Test',
        email: 'manager@test.cl',
        role: 'MANAGER'
    }),
    cashier: createUserFixture({
        id: '550e8400-e29b-41d4-a716-446655440012',
        name: 'Cajero Test',
        email: 'cajero@test.cl',
        role: 'CASHIER'
    }),
    warehouse: createUserFixture({
        id: '550e8400-e29b-41d4-a716-446655440013',
        name: 'Bodeguero Test',
        email: 'bodega@test.cl',
        role: 'WAREHOUSE'
    })
};

// =====================================================
// LOCATION & WAREHOUSE FIXTURES
// =====================================================

export interface LocationFixture {
    id: string;
    name: string;
    address: string;
    is_active: boolean;
    default_warehouse_id?: string;
}

export const createLocationFixture = (overrides: Partial<LocationFixture> = {}): LocationFixture => ({
    id: randomUUID(),
    name: 'Farmacia Central Test',
    address: 'Av. Brasil 123, Vallenar',
    is_active: true,
    default_warehouse_id: TEST_WAREHOUSE_ID,
    ...overrides
});

export interface WarehouseFixture {
    id: string;
    name: string;
    location_id: string;
    is_active: boolean;
    type: 'MAIN' | 'SECONDARY' | 'COLD_STORAGE';
}

export const createWarehouseFixture = (overrides: Partial<WarehouseFixture> = {}): WarehouseFixture => ({
    id: randomUUID(),
    name: 'Bodega Principal Test',
    location_id: TEST_LOCATION_ID,
    is_active: true,
    type: 'MAIN',
    ...overrides
});

export const TEST_LOCATION = createLocationFixture({ id: TEST_LOCATION_ID });
export const TEST_WAREHOUSE = createWarehouseFixture({ id: TEST_WAREHOUSE_ID });

// =====================================================
// TERMINAL & SESSION FIXTURES
// =====================================================

export interface TerminalFixture {
    id: string;
    name: string;
    location_id: string;
    current_cashier_id: string | null;
    status: 'OPEN' | 'CLOSED' | 'MAINTENANCE';
}

export const createTerminalFixture = (overrides: Partial<TerminalFixture> = {}): TerminalFixture => ({
    id: randomUUID(),
    name: 'Caja 1 Test',
    location_id: TEST_LOCATION_ID,
    current_cashier_id: null,
    status: 'CLOSED',
    ...overrides
});

export interface SessionFixture {
    id: string;
    terminal_id: string;
    user_id: string;
    opening_amount: number;
    closing_amount: number | null;
    opened_at: Date;
    closed_at: Date | null;
    status: 'OPEN' | 'CLOSED';
}

export const createSessionFixture = (overrides: Partial<SessionFixture> = {}): SessionFixture => ({
    id: randomUUID(),
    terminal_id: TEST_TERMINAL_ID,
    user_id: TEST_USERS.cashier.id,
    opening_amount: 50000,
    closing_amount: null,
    opened_at: new Date(),
    closed_at: null,
    status: 'OPEN',
    ...overrides
});

export const TEST_TERMINAL = createTerminalFixture({
    id: TEST_TERMINAL_ID,
    current_cashier_id: TEST_USERS.cashier.id,
    status: 'OPEN'
});

export const TEST_SESSION = createSessionFixture({ id: TEST_SESSION_ID });

// =====================================================
// PRODUCT & INVENTORY FIXTURES
// =====================================================

export interface ProductFixture {
    id: string;
    sku: string;
    name: string;
    price: number;
    cost_price: number;
    stock_actual: number;
    category: string;
    requires_prescription: boolean;
}

export const createProductFixture = (overrides: Partial<ProductFixture> = {}): ProductFixture => ({
    id: randomUUID(),
    sku: `SKU-${Date.now()}`,
    name: 'Producto Test',
    price: 5000,
    cost_price: 2500,
    stock_actual: 100,
    category: 'GENERAL',
    requires_prescription: false,
    ...overrides
});

export interface BatchFixture {
    id: string;
    product_id: string;
    warehouse_id: string;
    location_id: string;
    sku: string;
    name: string;
    lot_number: string;
    expiry_date: Date;
    quantity_real: number;
    unit_cost: number;
    sale_price: number;
}

export const createBatchFixture = (overrides: Partial<BatchFixture> = {}): BatchFixture => {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    return {
        id: randomUUID(),
        product_id: TEST_PRODUCT_ID,
        warehouse_id: TEST_WAREHOUSE_ID,
        location_id: TEST_LOCATION_ID,
        sku: 'SKU-TEST-001',
        name: 'Producto Test Batch',
        lot_number: `LOT-${Date.now()}`,
        expiry_date: expiryDate,
        quantity_real: 50,
        unit_cost: 2500,
        sale_price: 5000,
        ...overrides
    };
};

export const TEST_PRODUCT = createProductFixture({ id: TEST_PRODUCT_ID, sku: 'SKU-TEST-001' });
export const TEST_BATCH = createBatchFixture({ id: TEST_BATCH_ID });

// =====================================================
// MOCK QUERY RESPONSE BUILDERS
// =====================================================

/**
 * Creates a mock query response for database operations
 */
export const mockQueryResponse = <T>(rows: T[], rowCount?: number) => ({
    rows,
    rowCount: rowCount ?? rows.length
});

/**
 * Creates an empty query response
 */
export const emptyQueryResponse = () => mockQueryResponse([]);

/**
 * Creates a mock sequence of responses for multiple queries
 */
export function createMockQuerySequence(responses: Array<{ rows: any[]; rowCount?: number }>) {
    let callIndex = 0;
    return (sql: string) => {
        // Handle control statements
        if (sql === 'ROLLBACK' || sql === 'COMMIT' || sql.startsWith('BEGIN')) {
            return Promise.resolve({ rows: [] });
        }

        const response = responses[callIndex] || { rows: [] };
        callIndex++;
        return Promise.resolve({
            rows: response.rows,
            rowCount: response.rowCount ?? response.rows.length
        });
    };
}

// =====================================================
// COMMON TEST SCENARIOS
// =====================================================

/**
 * Mock responses for a successful stock movement
 */
export const STOCK_MOVEMENT_SUCCESS_MOCKS = [
    { rows: [] }, // BEGIN
    { rows: [{ id: TEST_BATCH_ID, quantity_real: 50, product_id: TEST_PRODUCT_ID, sku: 'SKU-001', name: 'Test Product' }] }, // Batch lock
    { rows: [], rowCount: 1 }, // Update batch
    { rows: [{ name: 'Test Product', sku: 'SKU-001' }] }, // Product details
    { rows: [{ location_id: TEST_LOCATION_ID }] }, // Warehouse location
    { rows: [], rowCount: 1 }, // Insert movement
    { rows: [], rowCount: 1 }, // Audit log
    { rows: [] }, // COMMIT
];

/**
 * Mock responses for a successful handover
 */
export const HANDOVER_SUCCESS_MOCKS = [
    { rows: [] }, // BEGIN
    { rows: [TEST_USERS.cashier] }, // PIN validation
    { rows: [{ role: 'CASHIER' }] }, // Role check
    { rows: [{ ...TEST_TERMINAL, location_id: TEST_LOCATION_ID }] }, // Terminal lock
    { rows: [{ ...TEST_SESSION, user_id: TEST_USERS.cashier.id }] }, // Session lock
    { rows: [], rowCount: 1 }, // Insert remittance
    { rows: [], rowCount: 1 }, // Update session
    { rows: [], rowCount: 1 }, // Update terminal
    { rows: [], rowCount: 1 }, // Audit
    { rows: [] }, // COMMIT
];
