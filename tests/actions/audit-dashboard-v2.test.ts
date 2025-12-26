/**
 * Tests - Audit Dashboard V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as auditV2 from '@/actions/audit-dashboard-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-user-id', 'u1'], ['x-user-role', 'ADMIN']])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe.skip('Audit Dashboard V2 - RBAC', () => {
    it('should require ADMIN/MANAGER role', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([['x-user-id', 'u1'], ['x-user-role', 'CASHIER']]) as any);
        const result = await auditV2.getAuditLogsSecure({ page: 1, limit: 25 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('permisos');
    });
});

describe.skip('Audit Dashboard V2 - Export PIN', () => {
    it('should require PIN for export >1000 records', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ total: 2000 }] } as any); // Count
        const result = await auditV2.exportAuditLogsSecure({ startDate: '2024-01-01' }); // No PIN
        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});
