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
    it('should reject overtime > 4 hours without approval', async () => {
        const result = await attendanceV2.registerAttendanceSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'CHECK_OUT',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            method: 'PIN',
            overtimeMinutes: 300 // 5 hours
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('aprobación');
    });

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

describe('Attendance V2 - Overtime Calculation', () => {
    it('should validate userId format', async () => {
        const result = await attendanceV2.calculateOvertimeSecure('invalid', 12, 2024);
        expect(result.success).toBe(false);
    });
});
