/**
 * Tests - Dashboard V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as dashboardV2 from '@/actions/dashboard-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Dashboard V2 - Authentication', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date(), to: new Date() }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Dashboard V2 - RBAC', () => {
    it('should restrict CASHIER to their terminal only', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CAJERO']
            // No terminal assigned
        ]) as any);

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date(), to: new Date() }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('terminal');
    });
});

describe('Dashboard V2 - Cash Flow RBAC', () => {
    it('should require MANAGER role for cash flow', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await dashboardV2.getCashFlowSecure({
            from: new Date(),
            to: new Date()
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('denegado');
    });
});
