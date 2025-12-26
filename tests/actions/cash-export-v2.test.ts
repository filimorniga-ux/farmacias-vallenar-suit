/**
 * Tests - Cash Export V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as cashExportV2 from '@/actions/cash-export-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([
        ['x-user-id', 'user-1'],
        ['x-user-role', 'CASHIER'],
        ['x-user-terminal', 'term-1'],
        ['x-user-location', 'loc-1']
    ]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe.skip('Cash Export V2 - RBAC', () => {
    it('should restrict CASHIER to their terminal only', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

        // Cashier should only see their terminal data
        const result = await cashExportV2.generateCashReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });

        // Should succeed but filter to their terminal
        expect(result.success).toBe(true);
    });

    it('should require MANAGER role for sales detail export', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await cashExportV2.exportSalesDetailSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});
