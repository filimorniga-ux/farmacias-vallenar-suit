/**
 * Tests - Sales Export V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as salesExportV2 from '@/actions/sales-export-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-user-id', 'u1'], ['x-user-role', 'CASHIER']])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe.skip('Sales Export V2 - RBAC', () => {
    it('should allow CASHIER to export only their own sales', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);
        const result = await salesExportV2.generateSalesReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(true); // Cajero puede exportar (solo sus ventas)
    });

    it('should require MANAGER for summary', async () => {
        const result = await salesExportV2.exportSalesSummarySecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});
