/**
 * Tests - Supply V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as supplyV2 from '@/actions/supply-v2';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn(),
            release: vi.fn()
        })
    }
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Supply V2 - Input Validation', () => {
    it('should reject invalid userId', async () => {
        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440000',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU001', name: 'Test', quantity: 10, cost: 100, productId: null }]
        }, 'invalid-user-id');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should reject empty items', async () => {
        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440000',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: []
        }, '550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(false);
        expect(result.error).toContain('item');
    });
});

describe('Supply V2 - Cancel PO', () => {
    it('should require reason with minimum length', async () => {
        const result = await supplyV2.cancelPurchaseOrderSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            '550e8400-e29b-41d4-a716-446655440001',
            'short'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });
});

describe('Supply V2 - History', () => {
    it('should return paginated results', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ total: '50' }], rowCount: 1 } as any) // Count query
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // Data query

        const result = await supplyV2.getSupplyOrdersHistory({ page: 1, pageSize: 10 });

        expect(result.success).toBe(true);
        expect(result.total).toBe(50);
    });
});

describe('Supply V2 - UUID/Proveedor interno normalization', () => {
    it('should accept TRANSFER supplier marker and persist supplier as null', async () => {
        const mockDb = await import('@/lib/db');
        const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
            if (sql.includes('SELECT location_id FROM warehouses WHERE id = $1')) {
                return { rows: [{ location_id: '550e8400-e29b-41d4-a716-446655440099' }], rowCount: 1 } as any;
            }
            if (sql.includes('INSERT INTO purchase_orders')) {
                return { rows: [], rowCount: 1, params } as any;
            }
            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.createPurchaseOrderSecure({
            id: 'PO-AUTO-TEST',
            supplierId: 'TRANSFER',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU001', name: 'Test', quantity: 10, cost: 100, productId: null }]
        }, '550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(true);
        expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/i);

        const insertCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO purchase_orders'));
        expect(insertCall).toBeDefined();
        expect(insertCall?.[1]?.[1]).toBeNull();
        expect(insertCall?.[1]?.[0]).toBe(result.orderId);
        expect(insertCall?.[1]?.[0]).not.toBe('PO-AUTO-TEST');
    });

    it('should return a persisted UUID when updating temp order id', async () => {
        const mockDb = await import('@/lib/db');
        const clientQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
            if (sql.includes('SELECT location_id FROM warehouses WHERE id = $1')) {
                return { rows: [{ location_id: '550e8400-e29b-41d4-a716-446655440099' }], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 1 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.updatePurchaseOrderSecure(
            'PO-AUTO-123',
            {
                id: 'PO-AUTO-123',
                supplierId: '',
                targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
                items: [{ sku: 'SKU001', name: 'Test', quantity: 1, cost: 100, productId: null }],
                status: 'DRAFT'
            },
            '550e8400-e29b-41d4-a716-446655440002'
        );

        expect(result.success).toBe(true);
        expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(result.orderId).not.toBe('PO-AUTO-123');
    });

    it('should update APPROVED status without mixed parameter types in SQL', async () => {
        const mockDb = await import('@/lib/db');
        const orderId = '550e8400-e29b-41d4-a716-446655440931';
        const userId = '550e8400-e29b-41d4-a716-446655440932';
        const supplierId = '550e8400-e29b-41d4-a716-446655440933';
        const warehouseId = '550e8400-e29b-41d4-a716-446655440934';

        const clientQuery = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT status, notes FROM purchase_orders WHERE id = $1')) {
                return { rows: [{ status: 'DRAFT', notes: null }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT id FROM warehouses WHERE id = $1')) {
                return { rows: [{ id: warehouseId }], rowCount: 1 } as any;
            }
            if (
                sql.includes('UPDATE purchase_orders') ||
                sql.includes('DELETE FROM purchase_order_items') ||
                sql.includes('INSERT INTO purchase_order_items')
            ) {
                return { rows: [], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.updatePurchaseOrderSecure(
            orderId,
            {
                supplierId,
                targetWarehouseId: warehouseId,
                items: [{ sku: 'SKU-APP-001', name: 'Producto Aprobado', quantity: 2, cost: 1000, productId: null }],
                notes: 'Aprobación manual',
                status: 'APPROVED'
            },
            userId
        );

        expect(result.success).toBe(true);

        const rawCalls = clientQuery.mock.calls as unknown as Array<unknown[]>;
        const updateCall = rawCalls.find((call) => String(call[0] || '').includes('UPDATE purchase_orders'));
        const updateParams = (updateCall?.[1] as unknown[]) || [];
        expect(updateCall).toBeDefined();
        expect(String(updateCall?.[0])).toContain('approved_by = CASE WHEN $6 THEN $7 ELSE approved_by END');
        expect(updateParams[5]).toBe(true);
        expect(updateParams[6]).toBe(userId);
    });
});

describe('Supply V2 - Legacy filter resilience', () => {
    it('should ignore non-uuid location filter in history', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const result = await supplyV2.getSupplyChainHistorySecure({
            locationId: 'BODEGA_CENTRAL',
            type: 'SHIPMENT',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        const firstCallParams = vi.mocked(mockDb.query).mock.calls[0]?.[1];
        expect(firstCallParams).toEqual([]);
    });

    it('should return empty detail payload for non-uuid temporary id', async () => {
        const mockDb = await import('@/lib/db');

        const result = await supplyV2.getHistoryItemDetailsSecure('PO-AUTO-777', 'PO');

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(vi.mocked(mockDb.query)).not.toHaveBeenCalled();
    });
});

describe('Supply V2 - Schema tolerance on mark as sent', () => {
    it('should mark transfer request as SENT without relying on created_at columns', async () => {
        const mockDb = await import('@/lib/db');
        const orderId = '550e8400-e29b-41d4-a716-446655440941';
        const userId = '550e8400-e29b-41d4-a716-446655440942';
        const targetWarehouseId = '550e8400-e29b-41d4-a716-446655440943';
        const originLocationId = '550e8400-e29b-41d4-a716-446655440944';
        const originWarehouseId = '550e8400-e29b-41d4-a716-446655440945';
        const productId = '550e8400-e29b-41d4-a716-446655440946';
        const batchId = '550e8400-e29b-41d4-a716-446655440947';

        const transferNotes = `[TRANSFER_REQUEST] ORIGEN:Sucursal Test(${originLocationId})`;

        const clientQuery = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT status, notes FROM purchase_orders WHERE id = $1')) {
                return { rows: [{ status: 'APPROVED', notes: transferNotes }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT 1') && sql.includes('FROM stock_movements')) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT id FROM warehouses WHERE id = $1')) {
                return { rows: [{ id: targetWarehouseId }], rowCount: 1 } as any;
            }
            if (sql.includes('FROM warehouses') && sql.includes('location_id::text = $1::text')) {
                return { rows: [{ id: originWarehouseId }], rowCount: 1 } as any;
            }
            if (sql.includes('FROM products p') && sql.includes('p.sku = $1')) {
                return {
                    rows: [{ id: productId, name: 'Producto Traspaso', sale_price: 1500, cost_price: 900 }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('FROM inventory_batches') && sql.includes('FOR UPDATE')) {
                return {
                    rows: [{ id: batchId, location_id: originLocationId, quantity_real: 10 }],
                    rowCount: 1
                } as any;
            }
            if (
                sql.includes('UPDATE inventory_batches') ||
                sql.includes('INSERT INTO stock_movements') ||
                sql.includes('UPDATE purchase_orders') ||
                sql.includes('DELETE FROM purchase_order_items') ||
                sql.includes('INSERT INTO purchase_order_items')
            ) {
                return { rows: [], rowCount: 1 } as any;
            }

            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.updatePurchaseOrderSecure(
            orderId,
            {
                supplierId: 'TRANSFER',
                targetWarehouseId,
                notes: transferNotes,
                status: 'SENT',
                items: [
                    { sku: 'SKU-T-001', name: 'Producto Traspaso', quantity: 3, cost: 900, productId: null }
                ]
            } as any,
            userId
        );

        expect(result.success).toBe(true);

        const warehouseLookupSql = clientQuery.mock.calls
            .map((call) => String(call[0] || ''))
            .find((sql) => sql.includes('FROM warehouses') && sql.includes('location_id::text = $1::text'));
        expect(warehouseLookupSql).toBeDefined();
        expect(warehouseLookupSql).not.toContain('created_at');

        const batchFifoSql = clientQuery.mock.calls
            .map((call) => String(call[0] || ''))
            .find((sql) => sql.includes('FROM inventory_batches') && sql.includes('FOR UPDATE'));
        expect(batchFifoSql).toBeDefined();
        expect(batchFifoSql).not.toContain('created_at');
    });
});

describe('Supply V2 - Receive PO schema compatibility', () => {
    it('should receive PO resolving warehouse location_id without default_location_id', async () => {
        const mockDb = await import('@/lib/db');
        const userId = '550e8400-e29b-41d4-a716-446655440901';
        const purchaseOrderId = '550e8400-e29b-41d4-a716-446655440902';

        const clientQuery = vi.fn(async (sql: string) => {
            if (
                sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' ||
                sql === 'COMMIT' ||
                sql === 'ROLLBACK' ||
                sql.startsWith('SAVEPOINT audit_supply_safe') ||
                sql.startsWith('ROLLBACK TO SAVEPOINT audit_supply_safe') ||
                sql.startsWith('RELEASE SAVEPOINT audit_supply_safe')
            ) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE NOWAIT')) {
                return {
                    rows: [{
                        id: purchaseOrderId,
                        status: 'SENT',
                        total_amount: 1000,
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1')) {
                return { rows: [{ sku: 'SKU-TEST-01', quantity_ordered: 2 }], rowCount: 1 } as any;
            }
            if (
                sql.includes('UPDATE purchase_order_items SET quantity_received') ||
                sql.includes('UPDATE purchase_orders') ||
                sql.includes('INSERT INTO audit_log')
            ) {
                return { rows: [], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.receivePurchaseOrderSecure(
            { purchaseOrderId },
            userId
        );

        expect(result.success).toBe(true);
        const sqlCalls = clientQuery.mock.calls.map((call) => String(call[0] || ''));
        expect(sqlCalls.some((sql) => sql.includes("SET status = 'REVIEW'"))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes('default_location_id'))).toBe(false);
        expect(sqlCalls.some((sql) => sql.includes('warehouse_locations'))).toBe(false);
    });

    it('should keep receive flow successful when audit_log table does not exist', async () => {
        const mockDb = await import('@/lib/db');
        const userId = '550e8400-e29b-41d4-a716-446655440911';
        const purchaseOrderId = '550e8400-e29b-41d4-a716-446655440912';

        const clientQuery = vi.fn(async (sql: string) => {
            if (
                sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' ||
                sql === 'COMMIT' ||
                sql === 'ROLLBACK' ||
                sql.startsWith('SAVEPOINT audit_supply_safe') ||
                sql.startsWith('ROLLBACK TO SAVEPOINT audit_supply_safe') ||
                sql.startsWith('RELEASE SAVEPOINT audit_supply_safe')
            ) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE NOWAIT')) {
                return {
                    rows: [{
                        id: purchaseOrderId,
                        status: 'SENT',
                        total_amount: 1000,
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1')) {
                return { rows: [{ sku: 'SKU-TEST-02', quantity_ordered: 1 }], rowCount: 1 } as any;
            }
            if (
                sql.includes('UPDATE purchase_order_items SET quantity_received') ||
                sql.includes('UPDATE purchase_orders SET status = \'REVIEW\'')
            ) {
                return { rows: [], rowCount: 1 } as any;
            }
            if (sql.includes('INSERT INTO audit_log')) {
                const relationError = new Error('relation "audit_log" does not exist') as Error & { code?: string };
                relationError.code = '42P01';
                throw relationError;
            }
            if (sql.includes('INSERT INTO audit_logs (usuario, accion, detalle, fecha)')) {
                return { rows: [], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.receivePurchaseOrderSecure(
            { purchaseOrderId },
            userId
        );

        expect(result.success).toBe(true);
        expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.any(Array));
        expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs (usuario, accion, detalle, fecha)'), expect.any(Array));
        expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should finalize PO review and move status to RECEIVED', async () => {
        const mockDb = await import('@/lib/db');
        const userId = '550e8400-e29b-41d4-a716-446655440921';
        const purchaseOrderId = '550e8400-e29b-41d4-a716-446655440922';
        const warehouseId = '550e8400-e29b-41d4-a716-446655440923';
        const locationId = '550e8400-e29b-41d4-a716-446655440924';
        const productId = '550e8400-e29b-41d4-a716-446655440925';
        const batchId = '550e8400-e29b-41d4-a716-446655440926';

        const clientQuery = vi.fn(async (sql: string) => {
            if (
                sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' ||
                sql === 'COMMIT' ||
                sql === 'ROLLBACK' ||
                sql.startsWith('SAVEPOINT audit_supply_safe') ||
                sql.startsWith('ROLLBACK TO SAVEPOINT audit_supply_safe') ||
                sql.startsWith('RELEASE SAVEPOINT audit_supply_safe')
            ) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('FROM purchase_orders') && sql.includes('FOR UPDATE NOWAIT')) {
                return {
                    rows: [{
                        id: purchaseOrderId,
                        status: 'REVIEW',
                        total_amount: 1000,
                        target_warehouse_id: warehouseId,
                        location_id: locationId,
                        notes: '[TRANSFER_REQUEST] TEST',
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('FROM purchase_order_items') && sql.includes('quantity_received')) {
                return {
                    rows: [{
                        sku: 'SKU-TEST-03',
                        name: 'Producto Review',
                        quantity_received: 3,
                        cost_price: 500,
                        lot_number: 'LOT-REV',
                        expiry_date: '2027-12-31T00:00:00.000Z',
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('FROM products p') && sql.includes('p.sku = $1')) {
                return {
                    rows: [{ id: productId, name: 'Producto Review', sale_price: 900, cost_price: 500 }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT id, quantity_real') && sql.includes('lot_number = $3')) {
                return {
                    rows: [{ id: batchId, quantity_real: 2 }],
                    rowCount: 1
                } as any;
            }
            if (
                sql.includes('UPDATE inventory_batches') ||
                sql.includes('INSERT INTO stock_movements') ||
                sql.includes('UPDATE purchase_orders') ||
                sql.includes('INSERT INTO audit_log')
            ) {
                return { rows: [], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 0 } as any;
        });

        vi.mocked(mockDb.pool.connect).mockResolvedValue({
            query: clientQuery,
            release: vi.fn()
        } as any);

        const result = await supplyV2.finalizePurchaseOrderReviewSecure(
            { purchaseOrderId, reviewNotes: 'Recepción conforme' },
            userId
        );

        expect(result.success).toBe(true);
        const sqlCalls = clientQuery.mock.calls.map((call) => String(call[0] || ''));
        expect(sqlCalls.some((sql) => sql.includes("SET status = 'RECEIVED'"))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes('INSERT INTO stock_movements'))).toBe(true);
        expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    });
});
