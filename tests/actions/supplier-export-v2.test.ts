/**
 * Tests - Supplier Export V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as supplierExportV2 from '@/actions/supplier-export-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-user-id', 'u1'], ['x-user-role', 'MANAGER']])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe.skip('Supplier Export V2 - RBAC', () => {
    it('should require ADMIN role', async () => {
        const result = await supplierExportV2.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});
