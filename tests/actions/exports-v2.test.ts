/**
 * Tests - POS/Queue/Attendance Export V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as posExportV2 from '@/actions/pos-export-v2';
import * as queueExportV2 from '@/actions/queue-export-v2';
import * as attendanceExportV2 from '@/actions/attendance-export-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/excel-generator', () => ({ ExcelService: vi.fn().mockImplementation(() => ({ generateReport: vi.fn().mockResolvedValue(Buffer.from('test')) })) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-user-id', 'u1'], ['x-user-role', 'CASHIER']])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe.skip('Queue Export V2 - RBAC', () => {
    it('should require MANAGER role for queue export', async () => {
        const result = await queueExportV2.exportQueueReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe.skip('Attendance Export V2 - RBAC', () => {
    it('should require MANAGER/RRHH role', async () => {
        const result = await attendanceExportV2.exportAttendanceReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});
