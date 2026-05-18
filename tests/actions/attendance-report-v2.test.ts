
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actionModule from '@/actions/attendance-export-v2';
import * as dbModule from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

const validUserId = '550e8400-e29b-41d4-a716-446655440001';

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn((sql: string) => {
        if (typeof sql === 'string' && (sql.includes('FROM users') || sql.includes('FROM sessions'))) {
             return Promise.resolve({ 
                 rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', role: 'MANAGER', is_active: true, name: 'Test User', assigned_location_id: 'loc-1' }], 
                 rowCount: 1 
             });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    pool: { connect: vi.fn() }
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class { generateReport = vi.fn().mockResolvedValue(Buffer.from('test')) }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: validUserId,
        role: 'MANAGER',
        locationId: 'loc-1',
        userName: 'Test User',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Attendance Export V2', () => {
    it('should success', async () => {
        const result = await actionModule.exportAttendanceReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(true);
    });

    it('should fail authentication if headers/cookies missing', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await actionModule.exportAttendanceReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });
});
