/**
 * WMS V2 Tests - Warehouse Management System
 * Test coverage for validation and edge cases
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    TEST_PRODUCT_ID,
    TEST_WAREHOUSE_ID,
    TEST_BATCH_ID,
    TEST_LOCATION_ID,
    TEST_USERS,
} from '../fixtures';

// =====================================================
// MOCKS
// =====================================================

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

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
        query: vi.fn(),
    },
}));

// Mock uuid
vi.mock('uuid', () => ({
    v4: () => 'mock-movement-uuid',
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Import after mocks
import { executeStockMovementSecure, getStockHistorySecure } from '@/actions/wms-v2';

// =====================================================
// TEST SUITE: Validation Tests (No DB required)
// =====================================================

describe('WMS V2 - Input Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should reject invalid productId format', async () => {
        const result = await executeStockMovementSecure({
            productId: 'invalid-not-uuid',
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'Test con ID inválido para validación',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should reject invalid warehouseId format', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: 'not-a-uuid',
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'Test con warehouse ID inválido',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should reject reason that is too short', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'corto',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });

    it('should reject negative quantity', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: -5,
            reason: 'Cantidad negativa no permitida',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('positiva');
    });

    it('should reject zero quantity', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'LOSS',
            quantity: 0,
            reason: 'Cantidad cero no tiene sentido',
            userId: TEST_USERS.warehouse.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('positiva');
    });

    it('should reject invalid movement type', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            // @ts-ignore - Testing invalid type
            type: 'INVALID_TYPE',
            quantity: 10,
            reason: 'Tipo de movimiento inválido',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
    });

    it('should require supervisor PIN for large adjustments (>=100)', async () => {
        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 150,
            reason: 'Ajuste grande sin autorización de supervisor',
            userId: TEST_USERS.cashier.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN de supervisor');
    });
});

// =====================================================
// TEST SUITE: Database Scenarios
// =====================================================

describe('WMS V2 - Database Scenarios', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fail if no batch is found for product/warehouse', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // FIFO batch selection - EMPTY
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            if (sql.startsWith('BEGIN')) return Promise.resolve({ rows: [] });
            const res = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(res);
        });

        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'Producto no existe en esta bodega',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('lotes disponibles');
    });

    it('should handle lock contention error (55P03)', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql.startsWith('BEGIN')) return Promise.resolve({ rows: [] });
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });

            // Simulate lock error on first real query
            const error: any = new Error('Lock not available');
            error.code = '55P03';
            throw error;
        });

        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'Test de concurrencia con bloqueo',
            userId: TEST_USERS.manager.id
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('siendo modificado');
    });
});

// =====================================================
// TEST SUITE: Stock History (Read Operations)
// =====================================================

describe('WMS V2 - getStockHistorySecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return paginated stock history', async () => {
        const { pool } = await import('@/lib/db');

        // Mock pool.query for this read operation
        vi.mocked(pool).query = vi.fn()
            .mockResolvedValueOnce({ rows: [{ total: '15' }] })
            .mockResolvedValueOnce({
                rows: [
                    { id: '1', movement_type: 'ADJUSTMENT', quantity: 10 },
                    { id: '2', movement_type: 'LOSS', quantity: -5 }
                ]
            });

        const result = await getStockHistorySecure({
            productId: TEST_PRODUCT_ID,
            page: 1,
            pageSize: 10
        });

        expect(result.success).toBe(true);
        expect(result.data?.movements.length).toBe(2);
        expect(result.data?.total).toBe(15);
    });

    it('should enforce maximum page size of 100', async () => {
        const { pool } = await import('@/lib/db');

        vi.mocked(pool).query = vi.fn()
            .mockResolvedValueOnce({ rows: [{ total: '200' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getStockHistorySecure({
            page: 1,
            pageSize: 999 // Should be capped to 100
        });

        expect(result.success).toBe(true);
        expect(result.data?.pageSize).toBe(100);
    });
});
