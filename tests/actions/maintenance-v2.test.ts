/**
 * Tests - Maintenance V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as maintenanceV2 from '@/actions/maintenance-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'ADMIN']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Maintenance V2 - RBAC', () => {
    it('should require ADMIN role for ghost sessions cleanup', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER']
        ]) as any);

        const result = await maintenanceV2.autoCloseGhostSessionsSecure('1234');

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require ADMIN role for health check', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await maintenanceV2.runSystemHealthCheck();

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});

describe('Maintenance V2 - Cleanup Validation', () => {
    it('should require minimum 30 days for cleanup', async () => {
        const result = await maintenanceV2.cleanupOldDataSecure(7, '1234');
        expect(result.success).toBe(false);
        expect(result.error).toContain('30 días');
    });
});
