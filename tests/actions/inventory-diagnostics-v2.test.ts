/**
 * Tests - Inventory Diagnostics V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as diagnosticsV2 from '@/actions/inventory-diagnostics-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'MANAGER',
        locationId: 'loc-1',
        userName: 'Manager',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Inventory Diagnostics V2 - RBAC', () => {
    it('should require MANAGER role for duplicates', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await diagnosticsV2.findDuplicateBatchesSecure({
            sku: true, lot: false, expiry: false, price: false
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('should require MANAGER role for expired batches', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await diagnosticsV2.findExpiredBatchesSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('should require MANAGER role for health report', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await diagnosticsV2.getInventoryHealthReportSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Inventory Diagnostics V2 - Validation', () => {
    it('should require at least one criteria for duplicates', async () => {
        const result = await diagnosticsV2.findDuplicateBatchesSecure({
            sku: false, lot: false, expiry: false, price: false
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('criterio');
    });
});
