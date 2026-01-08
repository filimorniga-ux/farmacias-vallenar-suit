/**
 * Tests - Inventory Export V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as inventoryExportV2 from '@/actions/inventory-export-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'MANAGER'], ['x-user-location', 'loc-1']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe.skip('Inventory Export V2 - RBAC', () => {
    it('should require MANAGER role for stock movements export', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await inventoryExportV2.exportStockMovementsSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            limit: 1000
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('should require ADMIN role for valuation export', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await inventoryExportV2.exportInventoryValuationSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});
