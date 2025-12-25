/**
 * Tests - Sync V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as syncV2 from '@/actions/sync-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Sync V2 - Security', () => {
    it('should NEVER return access_pin in fetchEmployeesSecure', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({
            rows: [
                { id: '1', rut: '12345678-9', name: 'Test', role: 'CASHIER', access_pin: '1234', access_pin_hash: 'hash' }
            ],
            rowCount: 1
        } as any).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const result = await syncV2.fetchEmployeesSecure();

        expect(result.success).toBe(true);
        expect(result.data?.[0]).not.toHaveProperty('access_pin');
        expect(result.data?.[0]).not.toHaveProperty('access_pin_hash');
    });

    it('should require authentication for fetchEmployeesSecure', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await syncV2.fetchEmployeesSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should audit data access', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // Employees query
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // Audit query

        await syncV2.fetchEmployeesSecure();

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('audit_log'),
            expect.anything()
        );
    });
});

describe('Sync V2 - Locations RBAC', () => {
    it('should filter locations for non-admin users', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'],
            ['x-user-location', 'loc-1']
        ]) as any);

        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ id: 'loc-1', name: 'Store 1' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        await syncV2.fetchLocationsSecure();

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('id = $1'),
            expect.arrayContaining(['loc-1'])
        );
    });
});
