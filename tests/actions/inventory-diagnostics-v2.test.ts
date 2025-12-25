/**
 * Tests - Inventory Diagnostics V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as diagnosticsV2 from '@/actions/inventory-diagnostics-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'MANAGER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Inventory Diagnostics V2 - RBAC', () => {
    it('should require MANAGER role for duplicates', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'] // Not manager
        ]) as any);

        const result = await diagnosticsV2.findDuplicateBatchesSecure({
            sku: true, lot: false, expiry: false, price: false
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('should require MANAGER role for expired batches', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await diagnosticsV2.findExpiredBatchesSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('should require MANAGER role for health report', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await diagnosticsV2.getInventoryHealthReportSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Inventory Diagnostics V2 - Validation', () => {
    it('should require at least one criteria for duplicates', async () => {
        const result = await diagnosticsV2.findDuplicateBatchesSecure({
            sku: false, lot: false, expiry: false, price: false
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('criterio');
    });
});
