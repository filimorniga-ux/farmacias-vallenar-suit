import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockValidatePinForRoles = vi.fn();

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
        query: (...args: unknown[]) => mockQuery(...args),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/pin-rbac', () => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        PinRbacError: MockPinRbacError,
        ROLE_GROUPS: {
            ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        },
        getActorOrFail: () => mockGetActorOrFail(),
        validatePinForRoles: (
            client: unknown,
            pin: unknown,
            allowedRoles: unknown,
            options?: unknown,
        ) => mockValidatePinForRoles(client, pin, allowedRoles, options),
    };
});

import {
    addClosingEntry,
    executeClosingSecure,
    getClosingDataSecure,
    getClosingReport,
    reopenPeriodSecure,
} from '@/actions/finance-closing-v2';

describe('Finance Closing V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockGetActorOrFail.mockResolvedValue({
            userId: 'session-finance-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Actor Financiero',
            tokenVersion: 1,
            sessionToken: 'finance-session-token',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: 'pin-gerente-1',
                name: 'Gerente PIN',
                role: 'GERENTE_GENERAL',
            },
            matchedBy: 'hash',
        });
    });

    it('should use session actor instead of payload userId in addClosingEntry', async () => {
        const result = await addClosingEntry({
            month: 3,
            year: 2026,
            category: 'CASH',
            referenceDate: '2026-03-10',
            amount: 100000,
            description: 'Caja del día',
            userId: '123e4567-e89b-12d3-a456-426614174111',
        });

        expect(result.success).toBe(true);

        const insertEntryCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO monthly_closing_entries'),
        ) as unknown[] | undefined;
        const insertEntryParams = (insertEntryCall?.[1] as unknown[]) || [];
        expect(insertEntryParams[7]).toBe('session-finance-1');

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('CLOSING_ENTRY_ADDED'),
        ) as unknown[] | undefined;
        const auditParams = (auditCall?.[1] as unknown[]) || [];
        expect(auditParams[0]).toBe('session-finance-1');
    });

    it('should keep actor from session and authorized_by as metadata in executeClosingSecure', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE NOWAIT')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT COUNT(*)::int as count FROM monthly_closing_entries')) {
                return Promise.resolve({ rows: [{ count: 1 }] });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const result = await executeClosingSecure({
            month: 3,
            year: 2026,
            gerentePin: '1234',
        });

        expect(result.success).toBe(true);

        const upsertCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO monthly_closings'),
        ) as unknown[] | undefined;
        const upsertParams = (upsertCall?.[1] as unknown[]) || [];
        expect(upsertParams[12]).toBe('session-finance-1');

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('MONTHLY_CLOSING_EXECUTED'),
        ) as unknown[] | undefined;
        const auditParams = (auditCall?.[1] as unknown[]) || [];
        expect(auditParams[0]).toBe('session-finance-1');
        expect(JSON.parse(String(auditParams[2]))).toMatchObject({
            authorized_by: 'pin-gerente-1',
            authorized_by_name: 'Gerente PIN',
        });
    });

    it('should keep actor from session and authorized_by as metadata in reopenPeriodSecure', async () => {
        mockValidatePinForRoles.mockResolvedValueOnce({
            valid: true,
            authorizedBy: {
                id: 'pin-admin-1',
                name: 'Admin PIN',
                role: 'ADMIN',
            },
            matchedBy: 'hash',
        });

        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT status FROM monthly_closings WHERE month = $1 AND year = $2 FOR UPDATE')) {
                return Promise.resolve({ rows: [{ status: 'CLOSED' }] });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const result = await reopenPeriodSecure({
            month: 3,
            year: 2026,
            adminPin: '1234',
            reason: 'Reapertura manual para corregir una diferencia detectada',
        });

        expect(result.success).toBe(true);

        const upsertCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO monthly_closings'),
        ) as unknown[] | undefined;
        const upsertParams = (upsertCall?.[1] as unknown[]) || [];
        expect(upsertParams[15]).toBe('session-finance-1');

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('PERIOD_REOPENED'),
        ) as unknown[] | undefined;
        const auditParams = (auditCall?.[1] as unknown[]) || [];
        expect(auditParams[0]).toBe('session-finance-1');
        expect(JSON.parse(String(auditParams[2]))).toMatchObject({
            authorized_by: 'pin-admin-1',
            authorized_by_name: 'Admin PIN',
        });
    });

    it('should reject monthly closing reads for insufficient actor role', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: 'cashier-session',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await getClosingDataSecure(3, 2026);

        expect(result.success).toBe(false);
        expect(result.error).toContain('gerencia');
    });

    it('should reject addClosingEntry for insufficient actor role', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: 'cashier-session',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await addClosingEntry({
            month: 3,
            year: 2026,
            category: 'CASH',
            referenceDate: '2026-03-10',
            amount: 100000,
            description: 'Intento sin rol',
            userId: '123e4567-e89b-12d3-a456-426614174111',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('editar');
    });

    it('should reject executeClosingSecure for insufficient actor role', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: 'cashier-session',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await executeClosingSecure({
            month: 3,
            year: 2026,
            gerentePin: '1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('cerrar');
    });

    it('should reject reopenPeriodSecure for non-admin actor role', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: 'manager-session',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await reopenPeriodSecure({
            month: 3,
            year: 2026,
            adminPin: '1234',
            reason: 'Reapertura manual para corregir una diferencia detectada',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Solo ADMIN');
    });

    it('should include persisted social_security_cost in closing totals', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT * FROM monthly_closings WHERE month = $1 AND year = $2')) {
                return Promise.resolve({
                    rows: [{
                        status: 'CLOSED',
                        notes: 'Mes validado',
                        social_security_cost: 12500,
                        updated_at: null,
                        closed_at: null,
                    }],
                });
            }

            if (sql.includes('FROM monthly_closing_entries e')) {
                return Promise.resolve({
                    rows: [
                        { id: '1', category: 'CASH', amount: 100000, reference_date: '2026-03-01', direction: 'IN', created_by_name: 'Actor', created_at: '2026-03-01T00:00:00.000Z' },
                        { id: '2', category: 'FIXED_EXPENSE', amount: 20000, reference_date: '2026-03-02', direction: 'OUT', created_by_name: 'Actor', created_at: '2026-03-02T00:00:00.000Z' },
                    ],
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const result = await getClosingDataSecure(3, 2026);

        expect(result.success).toBe(true);
        expect(result.data?.totals.expenses.total).toBe(32500);
        expect(result.data?.totals.netResult).toBe(67500);
        const entriesQuery = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('FROM monthly_closing_entries e'),
        )?.[0] as string | undefined;
        expect(entriesQuery).toContain('u.id::text = e.created_by::text');
    });

    it('should include persisted social_security_cost in closing report totals', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT social_security_cost FROM monthly_closings WHERE month = $1 AND year = $2')) {
                return Promise.resolve({
                    rows: [{ social_security_cost: 8000 }],
                });
            }

            if (sql.includes('SELECT category, amount FROM monthly_closing_entries WHERE month = $1 AND year = $2')) {
                return Promise.resolve({
                    rows: [
                        { category: 'CASH', amount: 50000 },
                        { category: 'PAYROLL', amount: 10000 },
                    ],
                    rowCount: 2,
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const result = await getClosingReport(3, 2026);

        expect(result.success).toBe(true);
        expect(result.data?.totals.expenses.total).toBe(18000);
        expect(result.data?.totals.netResult).toBe(32000);
    });
});
