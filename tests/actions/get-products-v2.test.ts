/**
 * Tests - Get Products V2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as getProductsV2 from '@/actions/get-products-v2';
import { getValidatedSession } from '@/lib/server-session';

// Valid UUIDs
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: VALID_UUID,
        role: 'CASHIER',
        locationId: 'loc-1',
        userName: 'Caja',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Get Products V2 - Auth Required', () => {
    it('should require authentication', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

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

    it('normaliza condicion_venta legacy al contrato corto read-side', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({
            rows: [{
                id: VALID_UUID,
                sku: 'SKU-RR',
                name: 'Producto retenido',
                price: 100,
                format: 'Unidad',
                location_name: 'Centro',
                condition: 'RECETA_RETENIDA',
            }]
        } as any);

        const result = await getProductsV2.getProductsSecure('retenido', VALID_UUID);

        expect(result.success).toBe(true);
        expect(result.data?.[0].condition).toBe('RR');
        expect(vi.mocked(mockDb.query).mock.calls[0]?.[0]).toContain("to_jsonb(p)->>'condicion_venta'");
        expect(vi.mocked(mockDb.query).mock.calls[0]?.[0]).not.toContain('p.condicion_venta');
    });
});
