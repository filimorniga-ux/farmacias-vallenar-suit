/**
 * Tests - Get Products V2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as getProductsV2 from '@/actions/get-products-v2';

// Valid UUIDs
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

// Default headers mock
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
    headers: () => mockHeaders()
}));

beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated CASHIER
    mockHeaders.mockResolvedValue(new Map([
        ['x-user-id', VALID_UUID],
        ['x-user-role', 'CASHIER']
    ]));
});

describe('Get Products V2 - Auth Required', () => {
    it('should require authentication', async () => {
        // Override: no auth
        mockHeaders.mockResolvedValueOnce(new Map());

        const result = await getProductsV2.getProductsSecure('test', VALID_UUID);
        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Get Products V2 - Stock Visibility', () => {
    it('should hide stock for non-managers', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({
            rows: [{
                id: VALID_UUID,
                sku: 'SKU1',
                name: 'Test',
                price: 100,
                format: 'Unidad',
                location_name: 'Centro'
            }]
        } as any);

        const result = await getProductsV2.getProductsSecure('test', VALID_UUID);
        expect(result.success).toBe(true);
        // CASHIER should not see stock
        expect(result.data?.[0].stock).toBeUndefined();
    });
});
