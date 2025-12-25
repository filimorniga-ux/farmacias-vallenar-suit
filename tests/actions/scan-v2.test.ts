/**
 * Tests - Scan V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as scanV2 from '@/actions/scan-v2';

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
