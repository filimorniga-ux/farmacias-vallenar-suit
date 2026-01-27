import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportsV2 from '@/actions/reports-detail-v2';
import * as dbModule from '@/lib/db';

const { mockCookies, mockHeaders } = vi.hoisted(() => ({
    mockCookies: {
        get: vi.fn(),
    },
    mockHeaders: {
        get: vi.fn(),
    }
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => mockHeaders),
    cookies: vi.fn(async () => mockCookies)
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(() => ({
            query: vi.fn(),
            release: vi.fn(),
        }))
    }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    // Default success mock: MANAGER from Location-1
    mockCookies.get.mockImplementation((key) => {
        if (key === 'user_id') return { value: 'user-1' };
        if (key === 'user_role') return { value: 'MANAGER' };
        if (key === 'user_location') return { value: 'loc-1' };
        return undefined;
    });
});

describe('Reports V2 - Cash Flow', () => {
    it('should success and return mapped data', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [
                { id: '1', timestamp: Date.now(), description: 'Venta', category: 'SALE', amount_in: 100, amount_out: 0, user_name: 'Test' }
            ],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });

        expect(result.success).toBe(true);
        expect(result.data?.[0].amount_in).toBe(100);
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), expect.any(Array));
    });

    it('should use cache for subsequent requests', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [], rowCount: 0, command: '', oid: 0, fields: []
        });

        // First call
        await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01' });
        const callCount = vi.mocked(dbModule.query).mock.calls.length;

        // Second call (same params)
        await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01' });
        expect(vi.mocked(dbModule.query).mock.calls.length).toBe(callCount); // No increase
    });

    it('should force locationId for non-admin managers', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [], rowCount: 0, command: '', oid: 0, fields: []
        });

        await reportsV2.getCashFlowLedgerSecure({ locationId: 'other-loc' });

        // Should find the data retrieval call (not the audit call)
        const dataCall = vi.mocked(dbModule.query).mock.calls.find(call =>
            call[0].includes('SELECT') && call[1]?.includes('loc-1')
        );

        expect(dataCall).toBeDefined();
        expect(dataCall![1]).not.toContain('other-loc');
    });

    it('should require MANAGER role for cash flow access', async () => {
        mockCookies.get.mockImplementation((name) => {
            if (name === 'user_role') return { value: 'CASHIER' };
            return { value: 'user-1' };
        });

        const result = await reportsV2.getCashFlowLedgerSecure({});
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Reports V2 - Tax Summary', () => {
    it('should calculate taxes correctly', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total: 119000 }], rowCount: 1, command: '', oid: 0, fields: []
        }); // Sales
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total: 59500 }], rowCount: 1, command: '', oid: 0, fields: []
        }); // Purchases

        mockCookies.get.mockImplementation((key) => {
            if (key === 'user_role') return { value: 'CONTADOR' };
            return { value: 'user-c' };
        });

        const result = await reportsV2.getTaxSummarySecure('2024-01');

        expect(result.success).toBe(true);
        expect(result.data.total_net_sales).toBe(100000); // 119000 / 1.19
        expect(result.data.total_vat_debit).toBe(19000);
        expect(result.data.estimated_tax_payment).toBe(19000 - 9500);
    });
});

describe('Reports V2 - Inventory Valuation', () => {
    it('should return totals for warehouse', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total_units: 50, total_cost: 5000, total_sale: 8000 }],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await reportsV2.getInventoryValuationSecure('loc-1');
        expect(result.success).toBe(true);
        expect(result.data.total_items).toBe(50);
        expect(result.data.potential_gross_margin).toBe(3000);
    });
});

describe('Reports V2 - Payroll', () => {
    it('should require ADMIN role for payroll', async () => {
        // Default is MANAGER
        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '1234');
        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require PIN for payroll access even if ADMIN', async () => {
        mockCookies.get.mockImplementation((key) => {
            if (key === 'user_role') return { value: 'ADMIN' };
            if (key === 'user_id') return { value: 'admin-1' };
            return undefined;
        });

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '');
        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should allow access with correct PIN', async () => {
        mockCookies.get.mockImplementation((key) => {
            if (key === 'user_role') return { value: 'ADMIN' };
            if (key === 'user_id') return { value: 'admin-1' };
            return undefined;
        });

        const mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };
        vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);

        // Security check: mock validateAdminPin logic inside query
        mockClient.query
            .mockResolvedValueOnce({ rows: [], command: 'BEGIN', rowCount: 0 }) // BEGIN
            .mockResolvedValueOnce({ // pin check
                rows: [{ id: 'admin-1', name: 'Admin', access_pin: '1234' }],
                rowCount: 1
            })
            .mockResolvedValueOnce({ // users data
                rows: [{ id: 'emp-1', rut: '1-1', name: 'Emp 1', base_salary: 500000 }],
                rowCount: 1
            })
            .mockResolvedValueOnce({ rows: [], command: 'INSERT', rowCount: 1 }) // audit
            .mockResolvedValueOnce({ rows: [], command: 'COMMIT', rowCount: 0 }); // COMMIT

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '1234');
        expect(result.success).toBe(true);
        expect(result.data?.[0].base_salary).toBe(500000);
    });
});
