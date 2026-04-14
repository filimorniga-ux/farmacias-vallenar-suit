import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetValidatedSession,
    mockRedirect,
    mockGetUsersSecure,
    mockGetTodayAttendanceSecure,
    mockGetApprovedAttendanceHistory,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
    mockGetUsersSecure: vi.fn(),
    mockGetTodayAttendanceSecure: vi.fn(),
    mockGetApprovedAttendanceHistory: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/actions/users-v2', () => ({
    getUsersSecure: (filters?: unknown) => mockGetUsersSecure(filters),
}));

vi.mock('@/actions/attendance-v2', () => ({
    getTodayAttendanceSecure: (locationId?: string) => mockGetTodayAttendanceSecure(locationId),
    getApprovedAttendanceHistory: (filters: unknown) => mockGetApprovedAttendanceHistory(filters),
}));

import RRHHPage from '@/app/rrhh/page';

const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('/app/rrhh/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUsersSecure.mockResolvedValue({
            success: true,
            data: { users: [], total: 0, page: 1, pageSize: 200, totalPages: 0 },
        });
        mockGetTodayAttendanceSecure.mockResolvedValue({ success: true, data: [] });
        mockGetApprovedAttendanceHistory.mockResolvedValue({ success: true, data: [] });
    });

    it('redirige antes de cargar datos sensibles si no hay sesión válida', async () => {
        mockGetValidatedSession.mockResolvedValue(null);

        await expect(RRHHPage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mockGetUsersSecure).not.toHaveBeenCalled();
        expect(mockGetTodayAttendanceSecure).not.toHaveBeenCalled();
        expect(mockGetApprovedAttendanceHistory).not.toHaveBeenCalled();
    });

    it('fuerza scope de sucursal para manager no global', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440999',
            role: 'MANAGER',
            locationId: LOCATION_ID,
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'session-token',
        });

        await RRHHPage();

        expect(mockGetUsersSecure).toHaveBeenCalledWith({
            locationId: LOCATION_ID,
            page: 1,
            pageSize: 200,
        });
        expect(mockGetTodayAttendanceSecure).toHaveBeenCalledWith(LOCATION_ID);
        expect(mockGetApprovedAttendanceHistory).toHaveBeenCalledWith(expect.objectContaining({
            locationId: LOCATION_ID,
        }));
    });
});
