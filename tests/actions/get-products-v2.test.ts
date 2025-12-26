/**
 * Tests - Get Products V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as getProductsV2 from '@/actions/get-products-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-user-id', 'u1'], ['x-user-role', 'CASHIER']])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe.skip('Get Products V2 - Auth Required', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);
        const result = await getProductsV2.getProductsSecure('test', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe.skip('Get Products V2 - Stock Visibility', () => {
    it('should hide stock for non-managers', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({ rows: [{ id: '1', sku: 'SKU1', name: 'Test', price: 100 }] } as any);
        const result = await getProductsV2.getProductsSecure('test', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(true);
        // CASHIER should not see stock
        expect(result.data?.[0].stock).toBeUndefined();
    });
});
