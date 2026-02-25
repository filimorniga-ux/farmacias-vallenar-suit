import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductSalesReportSecure } from '@/actions/reports-v2';
import * as dbModule from '@/lib/db';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

describe('reports-v2 - ventas por producto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('usa join robusto product_id/p.id casteando ambos a text', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [],
            rowCount: 0,
        } as any);

        const result = await getProductSalesReportSecure({
            period: 'TODAY',
            locationId: 'ALL',
            terminalId: 'ALL',
        });

        expect(result.success).toBe(true);

        const sql = String(vi.mocked(dbModule.query).mock.calls[0]?.[0] || '');
        expect(sql).toContain('JOIN products p ON ib.product_id::text = p.id::text');
    });

    it('ignora filtros de ubicación/caja inválidos (legacy no UUID) sin romper query', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [],
            rowCount: 0,
        } as any);

        const result = await getProductSalesReportSecure({
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
        expect(params).toHaveLength(2); // Solo rango fecha
    });
});

