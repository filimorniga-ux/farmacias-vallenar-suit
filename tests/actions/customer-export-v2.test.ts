import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockGenerateReport, requireCustomerActorMock } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockGenerateReport: vi.fn(),
    requireCustomerActorMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: mockQuery,
}));

vi.mock('@/actions/customer-scope', () => ({
    CUSTOMER_EXPORT_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    requireCustomerActor: requireCustomerActorMock,
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        generateReport = mockGenerateReport;
    }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as customerExport from '@/actions/customer-export-v2';

describe('Customer Export V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireCustomerActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: '550e8400-e29b-41d4-a716-446655440001',
                role: 'ADMIN',
                userName: 'Admin',
                locationId: '550e8400-e29b-41d4-a716-446655440010',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
        mockGenerateReport.mockResolvedValue(Buffer.from('xlsx'));
    });

    it('rechaza export global si el actor no tiene permiso', async () => {
        requireCustomerActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await customerExport.generateCustomerReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('no incluye teléfono ni email en el resumen exportado', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ id: 'cust-1', rut: '11111111-1', name: 'Cliente Uno', phone: '+56912345678', email: 'cliente@example.com', loyalty_points: 10 }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({
                rows: [{ customer_rut: '11111111-1', total: '25000', count: '2', last_purchase: '2024-01-15T12:00:00Z' }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await customerExport.generateCustomerReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
        });

        expect(result.success).toBe(true);
        expect(mockGenerateReport).toHaveBeenCalledTimes(1);
        const reportConfig = mockGenerateReport.mock.calls[0][0];
        expect(reportConfig.columns.map((column: { key: string }) => column.key)).not.toContain('phone');
        expect(reportConfig.columns.map((column: { key: string }) => column.key)).not.toContain('email');
    });
});
