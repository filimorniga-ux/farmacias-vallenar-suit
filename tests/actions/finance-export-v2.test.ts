/**
 * Tests - Finance Export V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as financeExportV2 from '@/actions/finance-export-v2';

vi.mock('@/lib/db', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'ADMIN']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe.skip('Finance Export V2 - Payroll PIN Requirement', () => {
    it('should require ADMIN role for payroll export', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await financeExportV2.exportPayrollSecure(1, 2024, '1234');

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require PIN for payroll export', async () => {
        const result = await financeExportV2.exportPayrollSecure(1, 2024, ''); // No PIN

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});

describe.skip('Finance Export V2 - Tax Summary RBAC', () => {
    it('should require CONTADOR/ADMIN for tax export', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await financeExportV2.exportTaxSummarySecure('2024-01');

        expect(result.success).toBe(false);
        expect(result.error).toContain('contadores');
    });
});
