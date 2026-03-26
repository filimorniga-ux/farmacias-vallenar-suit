/**
 * Tests - Maintenance V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as maintenanceV2 from '@/actions/maintenance-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'ADMIN',
        locationId: 'loc-1',
        userName: 'Admin',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Maintenance V2 - RBAC', () => {
    it('should require ADMIN role for ghost sessions cleanup', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await maintenanceV2.autoCloseGhostSessionsSecure('1234');

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require ADMIN role for health check', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

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
