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
});
