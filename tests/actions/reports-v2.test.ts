import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductSalesReportSecure } from '@/actions/reports-v2';
import * as dbModule from '@/lib/db';
import { getSessionSecure } from '@/actions/auth-v2';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

describe('reports-v2 - ventas por producto', () => {
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
    });

    it('usa join robusto y fuerza scope de ubicación para manager', async () => {
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
        const params = (vi.mocked(dbModule.query).mock.calls[0]?.[1] || []) as unknown[];

        expect(sql).toContain('JOIN products p ON ib.product_id::text = p.id::text');
        expect(sql).toContain('s.location_id::text = $3::text');
        expect(params[2]).toBe('550e8400-e29b-41d4-a716-446655440222');
    });

    it('rechaza sin sesión', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce(null);

        const result = await getProductSalesReportSecure({
            period: 'TODAY',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
        expect(dbModule.query).not.toHaveBeenCalled();
    });

    it('deniega filtro cross-location para manager', async () => {
        const result = await getProductSalesReportSecure({
            period: 'TODAY',
            locationId: '550e8400-e29b-41d4-a716-446655440333',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
        expect(dbModule.query).not.toHaveBeenCalled();
    });

    it('deniega terminal fuera del scope efectivo', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        } as any);

        const result = await getProductSalesReportSecure({
            period: 'TODAY',
            terminalId: '550e8400-e29b-41d4-a716-446655440444',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('caja');
    });
});
