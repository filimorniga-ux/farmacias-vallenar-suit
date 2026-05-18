import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAttendanceReportSecure } from '@/actions/attendance-report-v2';
import * as dbModule from '@/lib/db';
import { getSessionSecure } from '@/actions/auth-v2';

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('attendance-report-v2 scope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'manager-1',
            userName: 'Manager Uno',
            role: 'MANAGER',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);
    });

    it('rechaza sin sesión', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce(null);

        const result = await getAttendanceReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('deniega cross-location para manager', async () => {
        const result = await getAttendanceReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            locationId: 'loc-2',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
        expect(dbModule.query).not.toHaveBeenCalled();
    });

    it('enmascara rut para manager acotado a su sucursal', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        work_date: new Date('2024-01-10T00:00:00.000Z'),
                        user_id: 'emp-1',
                        name: 'Empleado Uno',
                        rut: '12345678-9',
                        role: 'CASHIER',
                        job_title: 'Cajero',
                        first_in: new Date('2024-01-10T09:00:00.000Z'),
                        last_out: new Date('2024-01-10T18:00:00.000Z'),
                        total_overtime: '0',
                        logs_count: 2,
                        hours_calc: 9,
                    },
                ],
                rowCount: 1,
            } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await getAttendanceReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(true);
        expect(result.data?.[0].rut).not.toBe('12345678-9');
        expect(result.data?.[0].rut?.endsWith('78-9')).toBe(true);
    });

    it('mantiene rut completo para RRHH dentro de scope', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce({
            userId: 'rrhh-1',
            userName: 'RRHH Uno',
            role: 'RRHH',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        work_date: new Date('2024-01-10T00:00:00.000Z'),
                        user_id: 'emp-1',
                        name: 'Empleado Uno',
                        rut: '12345678-9',
                        role: 'CASHIER',
                        job_title: 'Cajero',
                        first_in: new Date('2024-01-10T09:00:00.000Z'),
                        last_out: new Date('2024-01-10T18:00:00.000Z'),
                        total_overtime: '0',
                        logs_count: 2,
                        hours_calc: 9,
                    },
                ],
                rowCount: 1,
            } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await getAttendanceReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(true);
        expect(result.data?.[0].rut).toBe('12345678-9');
    });
});
