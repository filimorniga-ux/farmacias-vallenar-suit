/**
 * Tests - Audit Dashboard V2
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as auditV2 from '@/actions/audit-dashboard-v2';

const { mockGetSessionSecure } = vi.hoisted(() => ({
    mockGetSessionSecure: vi.fn()
}));

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/actions/auth-v2', () => ({ getSessionSecure: mockGetSessionSecure }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionSecure.mockResolvedValue({
        userId: 'u1',
        role: 'ADMIN',
        locationId: 'loc-1',
        userName: 'Admin'
    });
});

describe('Audit Dashboard V2 - RBAC', () => {
    it('should require ADMIN/MANAGER role', async () => {
        mockGetSessionSecure.mockResolvedValueOnce({
            userId: 'u1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Cashier'
        });
        const result = await auditV2.getAuditLogsSecure({ page: 1, limit: 25 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('permisos');
    });
});

describe('Audit Dashboard V2 - Export PIN', () => {
    it('should require PIN for export >1000 records', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ total: 2000 }] } as any); // Count
        const result = await auditV2.exportAuditLogsSecure({ startDate: '2024-01-01' }); // No PIN
        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});
