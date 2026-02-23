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
        const clientQuery = vi.fn(async (sql: string) => {
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

describe('Supply V2 - Receive PO schema compatibility', () => {
    it('should receive PO resolving warehouse location_id without default_location_id', async () => {
        const mockDb = await import('@/lib/db');
        const userId = '550e8400-e29b-41d4-a716-446655440901';
        const purchaseOrderId = '550e8400-e29b-41d4-a716-446655440902';
        const warehouseId = '550e8400-e29b-41d4-a716-446655440903';
        const locationId = '550e8400-e29b-41d4-a716-446655440904';
        const productId = '550e8400-e29b-41d4-a716-446655440905';

        const clientQuery = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as any;
            }
            if (sql.includes('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE NOWAIT')) {
                return {
                    rows: [{
                        id: purchaseOrderId,
                        status: 'SENT',
                        total_amount: 1000,
                        target_warehouse_id: warehouseId,
                        location_id: null,
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1')) {
                return { rows: [{ sku: 'SKU-TEST-01', quantity_ordered: 2 }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT location_id FROM warehouses WHERE id = $1')) {
                return { rows: [{ location_id: locationId }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT id, name, sale_price, cost_price FROM products WHERE sku = $1')) {
                return {
                    rows: [{ id: productId, name: 'Producto Test', sale_price: 1200, cost_price: 800 }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT id, quantity_real FROM inventory_batches')) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (
                sql.includes('INSERT INTO inventory_batches') ||
                sql.includes('INSERT INTO stock_movements') ||
                sql.includes('UPDATE purchase_order_items SET quantity_received') ||
                sql.includes('UPDATE purchase_orders SET status = \'RECEIVED\'') ||
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
        expect(clientQuery).toHaveBeenCalledWith('SELECT location_id FROM warehouses WHERE id = $1', [warehouseId]);
        const sqlCalls = clientQuery.mock.calls.map((call) => String(call[0] || ''));
        expect(sqlCalls.some((sql) => sql.includes('default_location_id'))).toBe(false);
        expect(sqlCalls.some((sql) => sql.includes('warehouse_locations'))).toBe(false);
    });

    it('should keep receive flow successful when audit_log table does not exist', async () => {
        const mockDb = await import('@/lib/db');
        const userId = '550e8400-e29b-41d4-a716-446655440911';
        const purchaseOrderId = '550e8400-e29b-41d4-a716-446655440912';
        const warehouseId = '550e8400-e29b-41d4-a716-446655440913';
        const locationId = '550e8400-e29b-41d4-a716-446655440914';
        const productId = '550e8400-e29b-41d4-a716-446655440915';

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
                        target_warehouse_id: warehouseId,
                        location_id: null,
                    }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1')) {
                return { rows: [{ sku: 'SKU-TEST-02', quantity_ordered: 1 }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT location_id FROM warehouses WHERE id = $1')) {
                return { rows: [{ location_id: locationId }], rowCount: 1 } as any;
            }
            if (sql.includes('SELECT id, name, sale_price, cost_price FROM products WHERE sku = $1')) {
                return {
                    rows: [{ id: productId, name: 'Producto Audit Fallback', sale_price: 900, cost_price: 500 }],
                    rowCount: 1
                } as any;
            }
            if (sql.includes('SELECT id, quantity_real FROM inventory_batches')) {
                return { rows: [], rowCount: 0 } as any;
            }
            if (
                sql.includes('INSERT INTO inventory_batches') ||
                sql.includes('INSERT INTO stock_movements') ||
                sql.includes('UPDATE purchase_order_items SET quantity_received') ||
                sql.includes('UPDATE purchase_orders SET status = \'RECEIVED\'')
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
});
