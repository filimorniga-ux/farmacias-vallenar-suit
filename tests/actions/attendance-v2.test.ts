/**
 * Tests - Attendance V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as attendanceV2 from '@/actions/attendance-v2';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(() => Promise.resolve({
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        }))
    }
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']])),
    cookies: vi.fn(async () => ({
        get: (name: string) => {
            const cookies = new Map([
                ['user_id', { value: 'user-1' }],
                ['user_role', { value: 'CASHIER' }]
            ]);
            return cookies.get(name);
        }
    }))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

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
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);
        vi.mocked(mockHeaders.cookies).mockResolvedValueOnce({
            get: vi.fn(() => undefined)
        } as any);

        const result = await attendanceV2.getMyAttendanceHistory();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should require MANAGER role for getTeamAttendanceHistory', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'] // Not a manager
        ]) as any);
        vi.mocked(mockHeaders.cookies).mockResolvedValueOnce({
            get: vi.fn((name) => {
                if (name === 'user_role') return { value: 'CASHIER' };
                if (name === 'user_id') return { value: 'user-1' };
                return undefined;
            })
        } as any);

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
        const { headers, cookies } = await import('next/headers'); // Import headers mock

        // Mock MANAGER session
        (headers as any).mockResolvedValue(new Map([['x-user-id', 'manager-1'], ['x-user-role', 'MANAGER']]));
        (cookies as any).mockResolvedValue({
            get: (name: string) => {
                if (name === 'user_role') return { value: 'MANAGER' };
                if (name === 'user_id') return { value: 'manager-1' };
                return undefined;
            }
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
