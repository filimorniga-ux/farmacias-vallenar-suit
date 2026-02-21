/**
 * Tests - Sales Export V2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as salesExportV2 from '@/actions/sales-export-v2';
import * as dbModule from '@/lib/db';

// Mock content
const validUserId = '550e8400-e29b-41d4-a716-446655440001';

const { mockGetSessionSecure } = vi.hoisted(() => ({
    mockGetSessionSecure: vi.fn()
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: mockGetSessionSecure
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn()
    }
}));

vi.mock('@/lib/excel-generator', () => {
    return {
        ExcelService: class {
            generateReport = vi.fn().mockResolvedValue(Buffer.from('test'));
        }
    };
});

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn() }
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionSecure.mockResolvedValue({
        userId: validUserId,
        role: 'CASHIER',
        locationId: '550e8400-e29b-41d4-a716-446655440111',
        userName: 'Cashier Test'
    });
});

describe('Sales Export V2 - RBAC', () => {
    it('should allow CASHIER to export only their own sales', async () => {
        // 1. Sales Data query
        // 2. Audit Insert query
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 0
            } as any)
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 1
            } as any);

        const result = await salesExportV2.generateSalesReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });

        expect(result.success).toBe(true);
    });

    it('should require MANAGER for summary', async () => {
        // No DB calls expected to succeed if RBAC fails early?
        // Or getting session validation first?
        // Usually getSession happens, then verification.
        // Assuming verifyAdminPermission or Manager check uses session.

        // Mock session check just in case
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{ id: validUserId, is_active: true, token_version: 1, role: 'CASHIER' }],
                rowCount: 1
            } as any);

        const result = await salesExportV2.exportSalesSummarySecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });
});
