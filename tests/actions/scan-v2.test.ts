/**
 * Tests - Scan V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as scanV2 from '@/actions/scan-v2';
import { query } from '@/lib/db';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([
        ['x-user-id', 'user-1'],
        ['x-user-role', 'CASHIER'],
        ['x-user-location', 'loc-1']
    ]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Scan V2 - Authentication', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await scanV2.scanProductSecure('SKU001', '550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Scan V2 - Validation', () => {
    it('should validate location ID format', async () => {
        const result = await scanV2.scanProductSecure('SKU001', 'invalid');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should validate code format', async () => {
        const result = await scanV2.scanProductSecure('', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(false);
    });
});

describe('Scan V2 - Location Check', () => {
    it('should restrict to user location', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'],
            ['x-user-location', 'loc-1']
        ]) as any);

        const result = await scanV2.scanProductSecure(
            'SKU001',
            '550e8400-e29b-41d4-a716-446655440002' // Different location
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
    });
});

describe('Scan V2 - Batch', () => {
    it('should limit batch size', async () => {
        const codes = Array(51).fill('SKU001'); // More than 50
        const result = await scanV2.scanBatchSecure(codes, '550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('50');
    });
});

describe('Scan V2 - Prioridad de lotes', () => {
    it('debe priorizar lote con stock y no retail en el SQL', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'],
            ['x-user-location', '550e8400-e29b-41d4-a716-446655440000']
        ]) as any);

        const mockedQuery = vi.mocked(query as any);
        mockedQuery.mockResolvedValueOnce({
            rows: [{
                id: 'batch-1',
                sku: 'SKU001',
                barcode: 'SKU001',
                name: 'Producto',
                price: 1000,
                stock: 5,
                condition: 'VD',
            }],
        });
        mockedQuery.mockResolvedValueOnce({ rows: [] }); // audit insert

        const result = await scanV2.scanProductSecure('SKU001', '550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(true);
        expect(mockedQuery).toHaveBeenCalled();
        const firstSql = String(mockedQuery.mock.calls[0][0]);
        expect(firstSql).toContain('ORDER BY');
        expect(firstSql).toContain('is_retail_lot');
        expect(firstSql).toContain('LIMIT 1');
    });
});
