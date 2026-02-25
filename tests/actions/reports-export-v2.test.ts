import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProductSalesSecure } from '@/actions/reports-export-v2';
import * as dbModule from '@/lib/db';
import { getSessionSecure } from '@/actions/auth-v2';

const generateReportMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
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
        } as any);

        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [
                {
                    product_id: '550e8400-e29b-41d4-a716-446655440200',
                    sku: 'SKU-001',
                    product_name: 'Producto Test',
                    category: 'GENERAL',
                    units_sold: 5,
                    total_amount: 10000,
                    avg_price: 2000,
                    transaction_count: 2,
                },
            ],
            rowCount: 1,
        } as any);

        generateReportMock.mockResolvedValue(Buffer.from('excel-mock'));
    });

    it('exporta Excel usando join robusto con cast a text', async () => {
        const result = await exportProductSalesSecure({
            period: 'TODAY',
            locationId: 'ALL',
            terminalId: 'ALL',
            employeeId: 'ALL',
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        const sql = String(vi.mocked(dbModule.query).mock.calls[0]?.[0] || '');
        expect(sql).toContain('JOIN products p ON ib.product_id::text = p.id::text');
    });

    it('ignora location/terminal legacy no UUID y evita cast ::uuid', async () => {
        const result = await exportProductSalesSecure({
            period: 'TODAY',
            locationId: 'BODEGA_CENTRAL',
            terminalId: 'CAJA_1',
            employeeId: 'ALL',
        });

        expect(result.success).toBe(true);

        const sql = String(vi.mocked(dbModule.query).mock.calls[0]?.[0] || '');
        const params = (vi.mocked(dbModule.query).mock.calls[0]?.[1] || []) as unknown[];

        expect(sql).not.toContain('s.location_id::text');
        expect(sql).not.toContain('s.terminal_id::text');
        expect(sql).not.toContain('::uuid');
        expect(params).toHaveLength(2); // Solo rango fecha
    });
});
