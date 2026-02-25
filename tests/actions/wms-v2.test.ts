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

const {
    mockQuery,
    mockRelease,
    mockConnect,
    mockPoolQuery,
    mockGetSessionSecure,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockRelease: vi.fn(),
    mockConnect: vi.fn(),
    mockPoolQuery: vi.fn(),
    mockGetSessionSecure: vi.fn(),
}));

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
        query: mockPoolQuery,
    },
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: mockGetSessionSecure,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
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
import {
    executeStockMovementSecure,
    executeTransferSecure,
    getStockHistorySecure,
    getShipmentsSecure,
    getPurchaseOrdersSecure,
    processReceptionSecure
} from '@/actions/wms-v2';

// =====================================================
// TEST SUITE: Validation Tests (No DB required)
// =====================================================

describe('WMS V2 - Input Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
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
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
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

    it('should keep transfer successful when audit FK fails', async () => {
        const targetWarehouseId = '550e8400-e29b-41d4-a716-446655440099';
        const targetLocationId = '550e8400-e29b-41d4-a716-446655440098';
        let locationLookupCount = 0;

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') return Promise.resolve({ rows: [] });
            if (sql.startsWith('SELECT location_id FROM warehouses')) {
                locationLookupCount += 1;
                return Promise.resolve({
                    rows: [{ location_id: locationLookupCount === 1 ? TEST_LOCATION_ID : targetLocationId }]
                });
            }
            if (sql.includes('SELECT * FROM inventory_batches') && sql.includes('FOR UPDATE NOWAIT')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_BATCH_ID,
                        quantity_real: 40,
                        sku: 'SKU-001',
                        name: 'Producto Test',
                        product_id: TEST_PRODUCT_ID,
                        lot_number: 'LOT-001',
                        expiry_date: null,
                        unit_cost: 1000,
                        sale_price: 1400
                    }]
                });
            }
            if (sql.includes('SELECT * FROM inventory_batches') && sql.includes('warehouse_id = $1')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('FROM products p') && sql.includes('WHERE p.id::text = $1')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_PRODUCT_ID,
                        name: 'Producto Test',
                        sale_price: 1400,
                        cost_price: 1000
                    }]
                });
            }
            if (sql.includes('INSERT INTO inventory_batches') && sql.includes('RETURNING id')) {
                return Promise.resolve({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440097' }] });
            }
            if (sql.includes('INSERT INTO audit_log')) {
                const fkError = new Error('FK violation') as Error & { code?: string };
                fkError.code = '23503';
                throw fkError;
            }
            if (sql.startsWith('SAVEPOINT') || sql.startsWith('ROLLBACK TO SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql === 'COMMIT') return Promise.resolve({ rows: [] });
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            return Promise.resolve({ rows: [] });
        });

        const result = await executeTransferSecure({
            originWarehouseId: TEST_WAREHOUSE_ID,
            targetWarehouseId,
            items: [{ productId: TEST_PRODUCT_ID, quantity: 5, lotId: TEST_BATCH_ID }],
            userId: TEST_USERS.manager.id,
            notes: 'Transferencia de prueba con fallback de auditoría'
        });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT audit_wms_safe');
        const didInsertShipment = mockQuery.mock.calls.some((call) => {
            const sql = String(call[0] ?? '');
            return sql.includes('INSERT INTO shipments');
        });
        expect(didInsertShipment).toBe(true);
    });
});

// =====================================================
// TEST SUITE: Stock History (Read Operations)
// =====================================================

describe('WMS V2 - getStockHistorySecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
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

describe('WMS V2 - getShipmentsSecure', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { pool } = await import('@/lib/db');
        vi.mocked(pool).query = mockPoolQuery as any;
        mockPoolQuery.mockReset();
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
    });

    it('should filter incoming shipments by destination location', async () => {
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: '550e8400-e29b-41d4-a716-446655440123',
                    origin_location_id: '550e8400-e29b-41d4-a716-446655440124',
                    origin_location_name: 'Bodega General',
                    destination_location_id: TEST_LOCATION_ID,
                    destination_location_name: 'Farmacia Prat',
                    created_by: TEST_USERS.manager.id,
                    created_by_name: TEST_USERS.manager.name,
                    status: 'IN_TRANSIT',
                    type: 'INTER_BRANCH',
                    created_at: new Date('2026-02-20T12:00:00.000Z'),
                    updated_at: new Date('2026-02-20T12:05:00.000Z'),
                    expected_delivery: null,
                    transport_data: { authorized_by_name: 'Supervisor QA' },
                    shipment_items: [
                        {
                            id: '550e8400-e29b-41d4-a716-446655440125',
                            batch_id: TEST_BATCH_ID,
                            sku: 'SKU-001',
                            name: 'Producto Test',
                            quantity: 5,
                        }
                    ],
                    valuation: '0',
                    documents: [],
                    notes: 'Despacho en tránsito',
                }]
            });

        const result = await getShipmentsSecure({
            locationId: TEST_LOCATION_ID,
            status: 'IN_TRANSIT',
            direction: 'INCOMING',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(result.data?.total).toBe(1);
        expect(result.data?.shipments[0]?.direction).toBe('INCOMING');
        expect(result.data?.shipments[0]?.authorized_by_name).toBe('Supervisor QA');

        const firstSql = String(mockPoolQuery.mock.calls[0]?.[0] || '');
        expect(firstSql).toContain('destination_location_id::text = $1::text');
    });

    it('should deny access when no session is available', async () => {
        mockGetSessionSecure.mockResolvedValueOnce(null);

        const result = await getShipmentsSecure({
            page: 1,
            pageSize: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autorizado');
    });

    it('should ignore legacy non-uuid location filter instead of failing', async () => {
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getShipmentsSecure({
            // ID legacy eliminado/humano
            locationId: 'BODEGA_CENTRAL',
            status: 'IN_TRANSIT',
            direction: 'INCOMING',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        const firstSql = String(mockPoolQuery.mock.calls[0]?.[0] || '');
        expect(firstSql).not.toContain('origin_location_id::text');
        expect(firstSql).not.toContain('destination_location_id::text = $1::text');
        expect(firstSql).toContain('s.status = $1');
    });
});

describe('WMS V2 - getPurchaseOrdersSecure', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { pool } = await import('@/lib/db');
        vi.mocked(pool).query = mockPoolQuery as any;
        mockPoolQuery.mockReset();
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
    });

    it('should filter by location with text cast and include items_count in response', async () => {
        const poId = '550e8400-e29b-41d4-a716-446655440301';

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: poId,
                    supplier_id: '550e8400-e29b-41d4-a716-446655440302',
                    target_warehouse_id: TEST_WAREHOUSE_ID,
                    location_id: TEST_LOCATION_ID,
                    location_name: 'Farmacia Santiago',
                    status: 'RECEIVED',
                    total_amount: '20000',
                    tax_amount: '3800',
                    items_count: '4',
                    created_at: new Date('2026-02-20T12:00:00.000Z'),
                    updated_at: new Date('2026-02-20T12:30:00.000Z'),
                    expected_delivery: null,
                    delivery_date: null,
                    created_by: TEST_USERS.manager.id,
                    created_by_name: TEST_USERS.manager.name,
                    approved_by: null,
                    approved_by_name: null,
                    received_by: TEST_USERS.manager.id,
                    received_by_name: TEST_USERS.manager.name,
                    notes: 'Recepción completa',
                    documents: [],
                    items: [{ sku: 'SKU-001', name: 'Producto', quantity: 2, cost: 1000 }],
                }]
            });

        const result = await getPurchaseOrdersSecure({
            locationId: TEST_LOCATION_ID,
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(result.data?.total).toBe(1);
        expect(result.data?.purchaseOrders[0]?.items_count).toBe(4);
        expect(result.data?.purchaseOrders[0]?.target_warehouse_id).toBe(TEST_WAREHOUSE_ID);
        expect(result.data?.purchaseOrders[0]?.targetWarehouseId).toBe(TEST_WAREHOUSE_ID);
        expect(Array.isArray(result.data?.purchaseOrders[0]?.items)).toBe(true);
        expect(result.data?.purchaseOrders[0]?.items?.length).toBe(1);

        const countSql = String(mockPoolQuery.mock.calls[0]?.[0] || '');
        const dataSql = String(mockPoolQuery.mock.calls[1]?.[0] || '');
        expect(countSql).toContain('w.location_id::text = $1::text');
        expect(dataSql).toContain('FROM purchase_order_items poi');
    });

    it('should ignore invalid location and supplier filters without throwing', async () => {
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getPurchaseOrdersSecure({
            locationId: 'SUCURSAL-PRAT-ANTIGUA',
            supplierId: 'PROVEEDOR-LEGACY',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        const countSql = String(mockPoolQuery.mock.calls[0]?.[0] || '');
        expect(countSql).not.toContain('w.location_id::text = $1::text');
        expect(countSql).not.toContain('po.supplier_id::text = $1::text');
    });
});

describe('WMS V2 - processReceptionSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: TEST_USERS.manager.id,
            userName: TEST_USERS.manager.name,
            role: 'ADMIN',
        });
    });

    it('should cast received_by_name to text in shipment update metadata', async () => {
        const shipmentId = '550e8400-e29b-41d4-a716-446655440200';
        const shipmentItemId = '550e8400-e29b-41d4-a716-446655440201';

        mockQuery.mockImplementation((sql: string) => {
            if (sql.startsWith('BEGIN')) return Promise.resolve({ rows: [] });
            if (sql.includes('SELECT * FROM shipments WHERE id = $1')) {
                return Promise.resolve({
                    rows: [{
                        id: shipmentId,
                        status: 'IN_TRANSIT',
                        type: 'INTER_BRANCH',
                        destination_location_id: TEST_LOCATION_ID,
                        transport_data: {}
                    }]
                });
            }
            if (sql.includes('SELECT id FROM warehouses WHERE location_id = $1::uuid')) {
                return Promise.resolve({ rows: [{ id: TEST_WAREHOUSE_ID }] });
            }
            if (sql.includes('SELECT * FROM shipment_items WHERE id = $1')) {
                return Promise.resolve({
                    rows: [{
                        id: shipmentItemId,
                        batch_id: TEST_BATCH_ID,
                        product_id: TEST_PRODUCT_ID,
                        sku: 'SKU-001',
                        name: 'Producto Test',
                    }]
                });
            }
            if (sql.includes('SELECT * FROM inventory_batches WHERE id = $1')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_BATCH_ID,
                        product_id: TEST_PRODUCT_ID,
                        unit_cost: 1000,
                        sale_price: 1200,
                        expiry_date: null,
                    }]
                });
            }
            if (sql.includes('FROM products p') && sql.includes('WHERE p.id::text = $1')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_PRODUCT_ID,
                        name: 'Producto Test',
                        sale_price: 1200,
                        cost_price: 1000
                    }]
                });
            }
            if (sql.includes('INSERT INTO inventory_batches')) {
                const params = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]?.[1] as unknown[];
                expect(String(params?.[3] || '')).toBe('TRF-550E8400-001-TURQUESA');
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('INSERT INTO stock_movements')) {
                const params = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]?.[1] as unknown[];
                expect(String(params?.[8] || '')).toContain('Color Turquesa');
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('UPDATE shipments')) {
                expect(sql).toContain(`'received_by_name', $3::text`);
                return Promise.resolve({ rows: [] });
            }
            if (sql.startsWith('SAVEPOINT') || sql.startsWith('ROLLBACK TO SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql === 'COMMIT') return Promise.resolve({ rows: [] });
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            return Promise.resolve({ rows: [] });
        });

        const result = await processReceptionSecure({
            shipmentId,
            receivedItems: [{ itemId: shipmentItemId, quantity: 2, condition: 'GOOD' }],
            notes: 'Recepción de prueba',
        });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    });
});
