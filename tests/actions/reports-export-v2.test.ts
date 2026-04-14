import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProductSalesSecure } from '@/actions/reports-export-v2';
import { getSessionSecure } from '@/actions/auth-v2';
import { getProductSalesReportSecure } from '@/actions/reports-v2';

const generateReportMock = vi.hoisted(() => vi.fn());

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/actions/reports-v2', () => ({
    getProductSalesReportSecure: vi.fn(),
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        async generateReport(...args: unknown[]) {
            return generateReportMock(...args);
        }
    },
}));

describe('reports-export-v2 - export ventas por producto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440111',
            userName: 'Gerente Test',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440222',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(getProductSalesReportSecure).mockResolvedValue({
            success: true,
            data: {
                rows: [
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440200',
                        sku: 'SKU-001',
                        product_name: 'Producto Test',
                        category: 'GENERAL',
                        units_sold: 5,
                        refunded_units: 1,
                        total_amount: 10000,
                        avg_price: 2000,
                        transaction_count: 2,
                    },
                ],
                summary: { totalUnits: 5, totalAmount: 10000, transactionCount: 2 },
            },
        } as any);

        generateReportMock.mockResolvedValue(Buffer.from('excel-mock'));
    });

    it('reutiliza la misma action de lectura del reporte', async () => {
        const filters = {
            period: 'TODAY' as const,
            locationId: 'ALL',
            terminalId: 'ALL',
            employeeId: 'ALL',
        };

        const result = await exportProductSalesSecure(filters);

        expect(result.success).toBe(true);
        expect(getProductSalesReportSecure).toHaveBeenCalledWith(filters);
        expect(generateReportMock).toHaveBeenCalledTimes(1);
    });

    it('propaga error si la capa de lectura falla', async () => {
        vi.mocked(getProductSalesReportSecure).mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        } as any);

        const result = await exportProductSalesSecure({
            period: 'TODAY',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(generateReportMock).not.toHaveBeenCalled();
    });
});
