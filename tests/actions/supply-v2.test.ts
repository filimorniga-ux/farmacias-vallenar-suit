/**
 * Tests - Supply V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as supplyV2 from '@/actions/supply-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Supply V2 - Input Validation', () => {
    it('should reject invalid userId', async () => {
        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440000',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU001', name: 'Test', quantity: 10, cost: 100 }]
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
            .mockResolvedValueOnce({ rows: [{ total: '50' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const result = await supplyV2.getSupplyOrdersHistory({ page: 1, pageSize: 10 });

        expect(result.success).toBe(true);
        expect(result.total).toBe(50);
    });
});
