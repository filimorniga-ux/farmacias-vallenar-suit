/**
 * Tests for Inventory V2 - Secure Stock Operations
 * 
 * Covers:
 * - Batch creation with validation
 * - Stock adjustments with authorization
 * - Stock transfers between locations
 * - Nuclear delete with ADMIN PIN
 * - Error handling (locks, serialization)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =====================================================
// TEST SETUP
// =====================================================

const mockQuery = vi.fn();
const mockDirectQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockBcryptCompare = vi.fn();

// Mock DB
vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
    },
    getClient: () => {
        mockConnect();
        return Promise.resolve({
            query: mockQuery,
            release: mockRelease,
        });
    },
    query: (...args: unknown[]) => mockDirectQuery(...args),
}));

// Mock uuid
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-1234',
}));

// Mock next/cache
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
    compare: (...args: any[]) => mockBcryptCompare(...args),
}));

// Import after mocks
import {
    createBatchSecure,
    adjustStockSecure,
    transferStockSecure,
    fractionateBatchSecure,
    fractionateBatchSecureDetailed,
    clearLocationInventorySecure,
    getInventorySecure,
    getWMSInventorySecure,
} from '@/actions/inventory-v2';

// Hardcoded thresholds (cannot export from 'use server' files)
const AUTHORIZATION_THRESHOLDS = {
    STOCK_ADJUSTMENT: 100,
    TRANSFER_QUANTITY: 500,
} as const;

// =====================================================
// TEST DATA
// =====================================================

const VALID_LOCATION_ID = '123e4567-e89b-12d3-a456-426614174001';
const VALID_WAREHOUSE_ID = '123e4567-e89b-12d3-a456-426614174002';
const VALID_USER_ID = 'user-123';
const VALID_BATCH_ID = '123e4567-e89b-12d3-a456-426614174003';
const VALID_TARGET_LOCATION = '123e4567-e89b-12d3-a456-426614174004';
const VALID_PIN = '1234';

// =====================================================
// TESTS: createBatchSecure
// =====================================================

describe('createBatchSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should create batch successfully with valid data', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // Location lookup (no default_warehouse)
            { rows: [] }, // Insert batch
            { rows: [] }, // Insert movement
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await createBatchSecure({
            sku: 'MED-001',
            name: 'Paracetamol 500mg',
            locationId: VALID_LOCATION_ID,
            quantity: 100,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(true);
        expect(result.batchId).toBeDefined();
    });

    it('should fail with invalid UUID for locationId', async () => {
        const result = await createBatchSecure({
            sku: 'MED-001',
            name: 'Paracetamol',
            locationId: 'invalid-uuid',
            quantity: 100,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should fail with empty SKU', async () => {
        const result = await createBatchSecure({
            sku: '',
            name: 'Paracetamol',
            locationId: VALID_LOCATION_ID,
            quantity: 100,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('SKU');
    });

    it('should fail with negative quantity', async () => {
        const result = await createBatchSecure({
            sku: 'MED-001',
            name: 'Paracetamol',
            locationId: VALID_LOCATION_ID,
            quantity: -10,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('positiva');
    });

    it('should resolve warehouse from location if not provided', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ default_warehouse_id: VALID_WAREHOUSE_ID }] }, // Location has warehouse
            { rows: [] }, // Insert batch
            { rows: [] }, // Insert movement
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await createBatchSecure({
            sku: 'MED-002',
            name: 'Ibuprofeno',
            locationId: VALID_LOCATION_ID,
            quantity: 50,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(true);
    });
});

// =====================================================
// TESTS: adjustStockSecure
// =====================================================

describe('adjustStockSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should adjust stock without authorization (under threshold)', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_BATCH_ID, sku: 'MED-001', name: 'Test', quantity_real: 100, location_id: VALID_LOCATION_ID, warehouse_id: VALID_WAREHOUSE_ID }] }, // Batch lock
            { rows: [], rowCount: 1 }, // Update quantity
            { rows: [] }, // Insert movement
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: 50, // Under threshold
            reason: 'Corrección de inventario',
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(true);
        expect(result.newQuantity).toBe(150);
    });

    it('should require authorization for large adjustments', async () => {
        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: AUTHORIZATION_THRESHOLDS.STOCK_ADJUSTMENT + 1, // Above threshold
            reason: 'Large adjustment',
            userId: VALID_USER_ID,
            // No PIN provided
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('requieren autorización');
    });

    it('should validate PIN for large adjustments', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: 'manager-1', name: 'Manager', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ id: VALID_BATCH_ID, sku: 'MED-001', name: 'Test', quantity_real: 1000, location_id: VALID_LOCATION_ID, warehouse_id: VALID_WAREHOUSE_ID }] }, // Batch
            { rows: [], rowCount: 1 }, // Update
            { rows: [] }, // Movement
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: 200, // Above threshold
            reason: 'Recepción de mercancía',
            userId: VALID_USER_ID,
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(mockBcryptCompare).toHaveBeenCalled();
    });

    it('should fail if adjustment would result in negative stock', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_BATCH_ID, sku: 'MED-001', name: 'Test', quantity_real: 10, location_id: VALID_LOCATION_ID }] }, // Batch with low stock
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: -100, // Would go negative
            reason: 'Test adjustment',
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('negativo');
    });

    it('should fail if batch not found', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // Batch lock - empty
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: 10,
            reason: 'Test',
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('no encontrado');
    });

    it('should handle lock contention gracefully', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            if (callIndex === 1) {
                // Simulate lock error
                const error: any = new Error('Lock not available');
                error.code = '55P03';
                throw error;
            }
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await adjustStockSecure({
            batchId: VALID_BATCH_ID,
            adjustment: 10,
            reason: 'Test',
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('bloqueado');
    });
});

// =====================================================
// TESTS: transferStockSecure
// =====================================================

describe('transferStockSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    it('should transfer stock to new location batch', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [{
                    id: VALID_BATCH_ID, sku: 'MED-001', name: 'Test', product_id: 'prod-1',
                    quantity_real: 100, location_id: VALID_LOCATION_ID, warehouse_id: VALID_WAREHOUSE_ID,
                    unit_cost: 1000, sale_price: 1500, expiry_date: null, lot_number: 'LOT-123',
                    stock_min: 0, stock_max: 1000
                }]
            }, // Source batch lock
            { rows: [] }, // Target location lookup (no default warehouse)
            { rows: [], rowCount: 1 }, // Update source quantity
            { rows: [] }, // Check existing batch in target - empty
            { rows: [] }, // Insert new batch
            { rows: [] }, // Insert OUT movement
            { rows: [] }, // Insert IN movement
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await transferStockSecure({
            sourceBatchId: VALID_BATCH_ID,
            targetLocationId: VALID_TARGET_LOCATION,
            quantity: 50,
            userId: VALID_USER_ID,
            reason: 'Transferencia entre sucursales',
        });

        expect(result.success).toBe(true);
        expect(result.targetBatchId).toBeDefined();
    });

    it('should fail if insufficient stock', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [{
                    id: VALID_BATCH_ID, sku: 'MED-001', name: 'Test',
                    quantity_real: 10, location_id: VALID_LOCATION_ID
                }]
            }, // Source with low stock
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await transferStockSecure({
            sourceBatchId: VALID_BATCH_ID,
            targetLocationId: VALID_TARGET_LOCATION,
            quantity: 50, // More than available
            userId: VALID_USER_ID,
            reason: 'Test transfer',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('insuficiente');
    });

    it('should fail with invalid Zod validation', async () => {
        const result = await transferStockSecure({
            sourceBatchId: 'invalid',
            targetLocationId: VALID_TARGET_LOCATION,
            quantity: 50,
            userId: VALID_USER_ID,
            reason: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

// =====================================================
// TESTS: clearLocationInventorySecure
// =====================================================

describe('clearLocationInventorySecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should require correct confirmation code', async () => {
        const result = await clearLocationInventorySecure({
            locationId: VALID_LOCATION_ID,
            userId: VALID_USER_ID,
            adminPin: VALID_PIN,
            confirmationCode: 'wrong-code',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('confirmación');
    });

    it('should require ADMIN PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // No admin found with matching PIN
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(false);

        const result = await clearLocationInventorySecure({
            locationId: VALID_LOCATION_ID,
            userId: VALID_USER_ID,
            adminPin: 'wrong-pin',
            confirmationCode: 'ELIMINAR-TODO',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should clear inventory with valid admin PIN and confirmation', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_USER_ID, name: 'Admin', role: 'ADMIN', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ role: 'ADMIN' }] }, // User role check
            { rows: [{ count: 50, total_units: 1000 }] }, // Snapshot
            { rows: [], rowCount: 50 }, // Delete
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await clearLocationInventorySecure({
            locationId: VALID_LOCATION_ID,
            userId: VALID_USER_ID,
            adminPin: VALID_PIN,
            confirmationCode: 'ELIMINAR-TODO',
        });

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(50);
    });

    it('should reject non-admin users', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_USER_ID, name: 'Admin', role: 'ADMIN', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ role: 'CASHIER' }] }, // User is not admin
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await clearLocationInventorySecure({
            locationId: VALID_LOCATION_ID,
            userId: VALID_USER_ID,
            adminPin: VALID_PIN,
            confirmationCode: 'ELIMINAR-TODO',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('permisos');
    });
});

// =====================================================
// TESTS: getInventorySecure
// =====================================================

describe('getInventorySecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    it('should reject invalid location ID', async () => {
        const result = await getInventorySecure('invalid-uuid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should flatten retail batches when pagination is disabled', async () => {
        const retailBatchId = '123e4567-e89b-12d3-a456-426614174555';
        mockDirectQuery.mockResolvedValueOnce({
            rows: [{
                group_key: 'product-group-1',
                product_id: '123e4567-e89b-12d3-a456-426614174099',
                sku: 'MED-001',
                name: 'Paracetamol 500mg',
                dci: 'Paracetamol',
                laboratory: 'LabX',
                category: 'MEDICAMENTOS',
                condition: 'VD',
                total_stock: 12,
                stock_min: 2,
                price_max: 1000,
                price_min: 1000,
                cost_net_max: 500,
                price_sell_box_max: 12000,
                price_sell_unit_max: 1000,
                units_per_box_max: 1,
                is_fractionable_group: false,
                units_stock_actual_total: 0,
                is_retail_lot_group: true,
                original_batch_id_group: VALID_BATCH_ID,
                location_id_group: VALID_LOCATION_ID,
                warehouse_id_group: VALID_WAREHOUSE_ID,
                source_system: 'MANUAL',
                batches: [{
                    id: retailBatchId,
                    name: '[AL DETAL] Paracetamol 500mg',
                    sku: 'MED-001',
                    stock_actual: 12,
                    lot_number: 'LOT-001',
                    expiry_date: null,
                    price: 1000,
                    units_per_box: 1,
                    is_fractionable: false,
                    units_stock_actual: 0,
                    is_retail_lot: true,
                    original_batch_id: VALID_BATCH_ID,
                }],
                total_groups: 1,
            }],
        });

        const result = await getInventorySecure(VALID_LOCATION_ID, { pagination: false });

        expect(result.success).toBe(true);
        expect(result.data.length).toBe(1);
        expect(result.data[0].id).toBe(retailBatchId);
        expect(result.data[0].is_retail_lot).toBe(true);
        expect(result.data[0].original_batch_id).toBe(VALID_BATCH_ID);
        expect(result.data[0].stock_actual).toBe(12);
    });

    it('should apply DETAIL category filter for retail lots with stock', async () => {
        let capturedSql = '';
        mockDirectQuery.mockImplementationOnce((sql: unknown) => {
            capturedSql = String(sql);
            return Promise.resolve({
                rows: [{
                    group_key: 'detail-1',
                    product_id: '123e4567-e89b-12d3-a456-426614174101',
                    sku: 'DET-001',
                    name: '[AL DETAL] Producto',
                    dci: 'Detalle',
                    laboratory: 'Lab',
                    category: 'MEDICAMENTOS',
                    condition: 'VD',
                    total_stock: 8,
                    stock_min: 1,
                    price_max: 500,
                    price_min: 500,
                    cost_net_max: 100,
                    price_sell_box_max: 500,
                    price_sell_unit_max: 500,
                    units_per_box_max: 1,
                    is_fractionable_group: false,
                    units_stock_actual_total: 8,
                    is_retail_lot_group: true,
                    original_batch_id_group: VALID_BATCH_ID,
                    location_id_group: VALID_LOCATION_ID,
                    warehouse_id_group: VALID_WAREHOUSE_ID,
                    source_system: 'MANUAL',
                    batches: [],
                    total_groups: 1,
                }],
            });
        });

        const result = await getInventorySecure(VALID_LOCATION_ID, { category: 'DETAIL' });

        expect(result.success).toBe(true);
        expect(capturedSql).toContain('COALESCE(ib.is_retail_lot, false) = true');
        expect(capturedSql).toContain('COALESCE(ib.stock_actual, 0) > 0');
    });

    it('should keep box and retail lots separated in paged inventory grouping', async () => {
        mockDirectQuery.mockResolvedValueOnce({
            rows: [
                {
                    group_key: 'prod-1::BOX',
                    product_id: 'prod-1',
                    sku: 'SKU-DET-1',
                    name: 'Producto Caja',
                    dci: 'DCI',
                    laboratory: 'LAB',
                    category: 'MEDICAMENTOS',
                    condition: 'VD',
                    total_stock: 87,
                    stock_min: 5,
                    price_max: 7524,
                    price_min: 7524,
                    cost_net_max: 1000,
                    price_sell_box_max: 7524,
                    price_sell_unit_max: 377,
                    units_per_box_max: 20,
                    is_fractionable_group: true,
                    units_stock_actual_total: 0,
                    is_retail_lot_group: false,
                    original_batch_id_group: null,
                    location_id_group: VALID_LOCATION_ID,
                    warehouse_id_group: VALID_WAREHOUSE_ID,
                    source_system: 'MANUAL',
                    batches: [],
                    total_groups: 2,
                },
                {
                    group_key: 'prod-1::DETAIL',
                    product_id: 'prod-1',
                    sku: 'SKU-DET-1',
                    name: '[AL DETAL] Producto Caja',
                    dci: 'DCI',
                    laboratory: 'LAB',
                    category: 'MEDICAMENTOS',
                    condition: 'VD',
                    total_stock: 20,
                    stock_min: 1,
                    price_max: 377,
                    price_min: 377,
                    cost_net_max: 1000,
                    price_sell_box_max: 7524,
                    price_sell_unit_max: 377,
                    units_per_box_max: 1,
                    is_fractionable_group: false,
                    units_stock_actual_total: 20,
                    is_retail_lot_group: true,
                    original_batch_id_group: VALID_BATCH_ID,
                    location_id_group: VALID_LOCATION_ID,
                    warehouse_id_group: VALID_WAREHOUSE_ID,
                    source_system: 'MANUAL',
                    batches: [],
                    total_groups: 2,
                }
            ],
        });

        const result = await getInventorySecure(VALID_LOCATION_ID, { pagination: true });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].stock_actual).toBe(87);
        expect(result.data[0].is_retail_lot).toBe(false);
        expect(result.data[1].stock_actual).toBe(20);
        expect(result.data[1].is_retail_lot).toBe(true);
    });
});

describe('getWMSInventorySecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    it('should reject invalid location ID', async () => {
        const result = await getWMSInventorySecure('invalid-uuid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should return only mapped stock rows for WMS fast load', async () => {
        let capturedSql = '';
        mockDirectQuery.mockImplementationOnce((sql: unknown) => {
            capturedSql = String(sql);
            return Promise.resolve({
                rows: [{
                    id: VALID_BATCH_ID,
                    product_id: '123e4567-e89b-12d3-a456-426614174199',
                    sku: 'WMS-001',
                    name: 'Producto WMS',
                    dci: 'DCI Test',
                    laboratory: 'Laboratorio',
                    category: 'MEDICAMENTOS',
                    condition: 'VD',
                    barcode: '7801234567890',
                    location_id: VALID_LOCATION_ID,
                    warehouse_id: VALID_WAREHOUSE_ID,
                    stock_actual: 22,
                    stock_min: 4,
                    expiry_date: null,
                    lot_number: 'LOT-WMS',
                    cost_net: 800,
                    price_sell_box: 1400,
                    price_sell_unit: 1400,
                    price: 1400,
                    units_per_box: 1,
                    is_fractionable: true,
                    units_stock_actual: 0,
                    is_retail_lot: false,
                    original_batch_id: null,
                    source_system: 'MANUAL',
                    created_at: null,
                }],
            });
        });

        const result = await getWMSInventorySecure(VALID_LOCATION_ID);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(VALID_BATCH_ID);
        expect(result.data[0].sku).toBe('WMS-001');
        expect(result.data[0].stock_actual).toBe(22);
        expect(result.data[0].location_id).toBe(VALID_LOCATION_ID);
        expect(capturedSql).toContain('ib.warehouse_id IN');
        expect(capturedSql).toContain('SELECT id FROM warehouses WHERE location_id = $1::uuid');
    });

    it('should include warehouse scope in getInventorySecure fallback query', async () => {
        let capturedSql = '';
        mockDirectQuery.mockImplementationOnce((sql: unknown) => {
            capturedSql = String(sql);
            return Promise.resolve({
                rows: [],
            });
        });

        const result = await getInventorySecure(VALID_LOCATION_ID, { pagination: false });

        expect(result.success).toBe(true);
        expect(capturedSql).toContain('ib.warehouse_id IN');
        expect(capturedSql).toContain('SELECT id FROM warehouses WHERE location_id = $1::uuid');
    });
});

// =====================================================
// TESTS: fractionateBatchSecure / fractionateBatchSecureDetailed
// =====================================================

describe('fractionateBatchSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    it('should fractionate successfully by auto-resolving units_per_box', async () => {
        mockDirectQuery.mockResolvedValueOnce({
            rows: [{ units_per_box: 12 }],
        });

        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [{
                    id: VALID_BATCH_ID,
                    product_id: '123e4567-e89b-12d3-a456-426614174099',
                    sku: 'MED-001',
                    name: 'Paracetamol 500mg',
                    location_id: VALID_LOCATION_ID,
                    warehouse_id: VALID_WAREHOUSE_ID,
                    quantity_real: 5,
                    sale_price: 12000,
                    cost_net: 5000,
                    price_sell_box: 12000,
                    price_sell_unit: 1000,
                    expiry_date: null,
                    lot_number: 'LOT-001',
                }]
            }, // Source batch lock
            { rows: [] }, // Update source (-1 box)
            { rows: [] }, // Existing retail search
            { rows: [] }, // Insert retail lot
            { rows: [] }, // Source movement
            { rows: [] }, // Retail movement
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await fractionateBatchSecure({
            batchId: VALID_BATCH_ID,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(true);
        expect(result.newBatchId).toBe('mock-uuid-1234');
    });

    it('should fail when units_per_box is not fractionable', async () => {
        mockDirectQuery.mockResolvedValueOnce({
            rows: [{ units_per_box: 1 }],
        });

        const result = await fractionateBatchSecure({
            batchId: VALID_BATCH_ID,
            userId: VALID_USER_ID,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('no es fraccionable');
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

describe('fractionateBatchSecureDetailed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
    });

    it('should append units to existing retail lot', async () => {
        const existingRetailLotId = '123e4567-e89b-12d3-a456-426614174777';
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [{
                    id: VALID_BATCH_ID,
                    product_id: '123e4567-e89b-12d3-a456-426614174099',
                    sku: 'MED-002',
                    name: 'Ibuprofeno 400mg',
                    location_id: VALID_LOCATION_ID,
                    warehouse_id: VALID_WAREHOUSE_ID,
                    quantity_real: 3,
                    sale_price: 9000,
                    cost_net: 3000,
                    price_sell_box: 9000,
                    price_sell_unit: 750,
                    expiry_date: null,
                    lot_number: 'LOT-002',
                }]
            }, // Source batch lock
            { rows: [] }, // Update source
            { rows: [{ id: existingRetailLotId, quantity_real: 7 }] }, // Existing retail lot
            { rows: [] }, // Update retail lot
            { rows: [] }, // Source movement
            { rows: [] }, // Retail movement
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await fractionateBatchSecureDetailed({
            batchId: VALID_BATCH_ID,
            userId: VALID_USER_ID,
            unitsInBox: 12,
        });

        expect(result.success).toBe(true);
        expect(result.newBatchId).toBe(existingRetailLotId);
        expect(
            mockQuery.mock.calls.some((call) =>
                typeof call[0] === 'string' && call[0].includes('INSERT INTO inventory_batches')
            )
        ).toBe(false);
    });

    it('should fail when source lot has no boxes left', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [{
                    id: VALID_BATCH_ID,
                    sku: 'MED-003',
                    name: 'Amoxicilina',
                    location_id: VALID_LOCATION_ID,
                    quantity_real: 0,
                }]
            }, // Source batch lock with zero stock
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await fractionateBatchSecureDetailed({
            batchId: VALID_BATCH_ID,
            userId: VALID_USER_ID,
            unitsInBox: 8,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('cajas suficientes');
    });
});
