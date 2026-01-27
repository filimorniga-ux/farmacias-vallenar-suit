import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dashboardV2 from '@/actions/dashboard-v2';
import * as dbModule from '@/lib/db';

const { mockHeaders } = vi.hoisted(() => ({
    mockHeaders: {
        get: vi.fn()
    }
}));

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => mockHeaders)
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.get.mockImplementation((key) => {
        if (key === 'x-user-id') return 'user-1';
        if (key === 'x-user-role') return 'ADMIN';
        return null;
    });
});

describe('Dashboard V2 - Authentication', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-03-01T00:00:00Z'), to: new Date('2024-03-02T00:00:00Z') }
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
        ]) as any);

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-04-01T00:00:00Z'), to: new Date('2024-04-02T00:00:00Z') }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('terminal');
    });
});

describe('Dashboard V2 - Financial Metrics', () => {
    it('should return metrics for admin', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [{ total_sales: 1000, total: 1000, count: 5, cash: 500, debit: 300, credit: 200, transfer: 0 }],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-01-01T00:00:00Z'), to: new Date('2024-01-02T00:00:00Z') }
        });

        expect(result.success).toBe(true);
        expect(result.data?.summary.total_sales).toBe(1000);
    });

    it('should handle database errors gracefully', async () => {
        vi.mocked(dbModule.query).mockRejectedValue(new Error('DB Fail'));

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-02-01T00:00:00Z'), to: new Date('2024-02-02T00:00:00Z') }
        });

        expect(result.success).toBe(false);
        expect(result.error?.toLowerCase()).toContain('error');
    });
});
