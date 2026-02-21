/**
 * Tests - POS/Queue/Attendance Export V2
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as posExportV2 from '@/actions/pos-export-v2';
import * as queueExportV2 from '@/actions/queue-export-v2';
import * as attendanceExportV2 from '@/actions/attendance-export-v2';

const { mockGetSessionSecure, mockHeaders, mockCookies } = vi.hoisted(() => ({
    mockGetSessionSecure: vi.fn(),
    mockHeaders: vi.fn(async () => new Map()),
    mockCookies: vi.fn(async () => ({
        get: vi.fn(() => undefined)
    }))
}));

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('@/actions/auth-v2', () => ({ getSessionSecure: mockGetSessionSecure }));
vi.mock('next/headers', () => ({
    headers: mockHeaders,
    cookies: mockCookies
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionSecure.mockResolvedValue({
        userId: 'u1',
        role: 'CASHIER',
        locationId: 'loc-1',
        userName: 'Cashier'
    });
});

describe('Queue Export V2 - RBAC', () => {
    it('should require MANAGER role for queue export', async () => {
        const result = await queueExportV2.exportQueueReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Attendance Export V2 - RBAC', () => {
    it('should require authentication for attendance export', async () => {
        const result = await attendanceExportV2.exportAttendanceReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });
});
