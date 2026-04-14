import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAttendanceSummarySecure } from '@/actions/attendance-export-v2';
import { getValidatedSession } from '@/lib/server-session';
import { getAttendanceReportSecure } from '@/actions/attendance-report-v2';

const generateReportMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/actions/attendance-report-v2', () => ({
    getAttendanceReportSecure: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        async generateReport(...args: unknown[]) {
            return generateReportMock(...args);
        }
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('attendance-export-v2 - resumen de asistencia', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getValidatedSession).mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(getAttendanceReportSecure).mockResolvedValue({
            success: true,
            data: [
                {
                    date: '2024-01-10',
                    user_id: 'emp-1',
                    user_name: 'Empleado Uno',
                    rut: '***678-9',
                    job_title: 'Cajero',
                    check_in: '2024-01-10T09:00:00.000Z',
                    check_out: '2024-01-10T18:00:00.000Z',
                    hours_worked: 9,
                    status: 'PRESENT',
                    overtime_minutes: 0,
                },
            ],
        } as any);

        generateReportMock.mockResolvedValue(Buffer.from('excel-summary'));
    });

    it('exporta usando la misma capa de lectura del tab HR', async () => {
        const params = {
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            locationId: 'loc-1',
            role: 'CASHIER',
        };

        const result = await exportAttendanceSummarySecure(params);

        expect(result.success).toBe(true);
        expect(getAttendanceReportSecure).toHaveBeenCalledWith(params);
        expect(generateReportMock).toHaveBeenCalledTimes(1);
    });

    it('propaga error de acceso si el reporte base falla', async () => {
        vi.mocked(getAttendanceReportSecure).mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        } as any);

        const result = await exportAttendanceSummarySecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(generateReportMock).not.toHaveBeenCalled();
    });
});
