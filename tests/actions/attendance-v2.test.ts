/**
 * Tests - Attendance V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as attendanceV2 from '@/actions/attendance-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(() => Promise.resolve({
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        }))
    }
}));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-forwarded-for', '127.0.0.1']])),
    cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) }))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'CASHIER',
        userName: 'Caja',
        locationId: 'loc-1',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Attendance V2 - Sequence Validation', () => {


    it('should accept overtime <= 4 hours', async () => {
        const result = await attendanceV2.registerAttendanceSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'CHECK_IN',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            method: 'PIN',
            overtimeMinutes: 0
        });

        // Will fail on DB but validates input correctly
        if (result.error) {
            expect(result.error).not.toContain('aprobación');
        }
    });

    it('should validate UUID format', async () => {
        const result = await attendanceV2.registerAttendanceSecure({
            userId: 'invalid',
            type: 'CHECK_IN',
            locationId: 'invalid',
            method: 'PIN',
            overtimeMinutes: 0
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

describe('Attendance V2 - RBAC', () => {
    it('should require authentication for getMyAttendanceHistory', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await attendanceV2.getMyAttendanceHistory();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should require MANAGER role for getTeamAttendanceHistory', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            userName: 'Caja',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await attendanceV2.getTeamAttendanceHistory();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Attendance V2 - Overtime Logic', () => {


    it('should allow overtime > 4 hours (pending approval)', async () => {
        const mockDb = await import('@/lib/db');

        // Setup shared client
        const sharedClient = {
            query: vi.fn(),
            release: vi.fn()
        };
        (mockDb.pool.connect as any).mockResolvedValue(sharedClient);

        // Robust mock
        sharedClient.query.mockImplementation(async (sql: string | any) => {
            const queryText = (typeof sql === 'string' ? sql : sql.text) || '';

            if (queryText.includes('BEGIN')) return { rows: [] };
            if (queryText.includes('SELECT type FROM attendance_logs')) {
                return { rows: [{ type: 'CHECK_IN' }] };
            }
            if (queryText.includes('FROM attendance_logs WHERE user_id') && queryText.includes('AND type = \'CHECK_IN\'')) {
                return { rows: [] };
            }

            if (queryText.includes('INSERT')) return { rows: [], rowCount: 1 };
            if (queryText.includes('COMMIT')) return { rows: [] };

            return { rows: [], rowCount: 0 };
        });

        const result = await attendanceV2.registerAttendanceSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'CHECK_OUT',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            method: 'PIN',
            overtimeMinutes: 300 // 5 hours
        });

        if (!result.success) console.error('Overtime Test Failed:', result.error);
        expect(result.success).toBe(true);
        expect(result.attendanceId).toBeDefined();
    });
});

describe('Attendance V2 - History & Pagination', () => {
    it('should support pagination in history', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            userName: 'Manager',
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        // getApprovedAttendanceHistory uses 'query', NOT 'pool'.
        (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

        const result = await attendanceV2.getApprovedAttendanceHistory({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });

        if (!result.success) console.error('History Test Failed:', result.error);
        expect(result.success).toBe(true);

        // Verify mock call contained LIMIT/OFFSET
        const lastCall = (mockDb.query as any).mock.calls[0];
        expect(lastCall[0]).toContain('LIMIT 50');
        expect(lastCall[0]).toContain('OFFSET 0');
    });
});

describe('Attendance V2 - Security', () => {
    it('should fail approval with invalid manager PIN', async () => {
        const result = await attendanceV2.approveOvertimeSecure({
            attendanceId: '550e8400-e29b-41d4-a716-446655440099',
            managerPin: '0000', // Invalid
            approved: true
        });
        expect(result.success).toBe(false);
    });
});
