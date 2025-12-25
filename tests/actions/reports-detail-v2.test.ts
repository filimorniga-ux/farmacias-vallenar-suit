/**
 * Tests - Reports Detail V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as reportsV2 from '@/actions/reports-detail-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'MANAGER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Reports V2 - Cash Flow RBAC', () => {
    it('should require MANAGER role for cash flow', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await reportsV2.getCashFlowLedgerSecure({});

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Reports V2 - Tax Summary RBAC', () => {
    it('should require ADMIN/CONTADOR role for tax summary', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER'] // Not admin/contador
        ]) as any);

        const result = await reportsV2.getTaxSummarySecure('2024-01');

        expect(result.success).toBe(false);
        expect(result.error).toContain('contadores');
    });
});

describe('Reports V2 - Payroll PIN Required', () => {
    it('should require ADMIN role for payroll', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '1234');

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require PIN for payroll access', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'admin-1'],
            ['x-user-role', 'ADMIN']
        ]) as any);

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, ''); // No PIN

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});
