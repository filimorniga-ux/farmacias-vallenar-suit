import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSalesHistorySecure } from '@/actions/pos-export-v2';
import * as dbModule from '@/lib/db';

const { mockGetSessionSecure, mockQuery } = vi.hoisted(() => ({
    mockGetSessionSecure: vi.fn(),
    mockQuery: vi.fn(),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: mockGetSessionSecure,
}));

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        generateReport = vi.fn().mockResolvedValue(Buffer.from('test'));
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('POS Export V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440001',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440111',
            userName: 'Manager Test',
        });
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('exports sales history without legacy sales columns', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'sale-1',
                timestamp: new Date('2026-05-18T12:00:00Z'),
                total_amount: 1000,
                payment_method: 'CASH',
                dte_folio: null,
                status: 'COMPLETED',
                edited_at: null,
                branch_name: 'Farmacia Centro',
                seller_name: 'Cajero',
                refund_amount: 0,
            }],
            rowCount: 1,
        });

        const result = await exportSalesHistorySecure({
            startDate: '2026-05-18',
            endDate: '2026-05-18',
            searchTerm: 'cliente',
        });

        expect(result.success).toBe(true);
        const sql = vi.mocked(dbModule.query).mock.calls.map((call) => String(call[0])).join('\n');
        expect(sql).toContain('NULL::timestamp as edited_at');
        expect(sql).toContain('EXISTS');
        expect(sql).not.toContain('s.edited_at');
        expect(sql).not.toContain('s.customer_name');
    });
});
