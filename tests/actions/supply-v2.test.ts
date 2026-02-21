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
