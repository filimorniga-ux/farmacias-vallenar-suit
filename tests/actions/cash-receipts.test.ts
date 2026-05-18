import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCashReceipts, getReceiptDetails } from '@/actions/analytics/cash-receipts';
import * as dbModule from '@/lib/db';
import { getSessionSecure } from '@/actions/auth-v2';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

describe('cash-receipts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'user-1',
            userName: 'Manager Uno',
            role: 'MANAGER',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);
    });

    it('rechaza listado sin sesión', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce(null);

        const result = await getCashReceipts({
            startDate: new Date('2024-01-01T00:00:00.000Z'),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
        expect(dbModule.query).not.toHaveBeenCalled();
    });

    it('limita el listado a la ubicación efectiva del actor', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [
                {
                    id: 'sale-1',
                    timestamp: new Date('2024-01-01T12:00:00.000Z'),
                    total_amount: 12000,
                    user_name: 'Caja Uno',
                    items_count: 2,
                    items_summary: 'Paracetamol, Ibuprofeno',
                    status: 'COMPLETED',
                    dte_folio: null,
                },
            ],
            rowCount: 1,
        } as any);

        const result = await getCashReceipts({
            startDate: new Date('2024-01-01T00:00:00.000Z'),
            endDate: new Date('2024-01-01T23:59:59.999Z'),
        });

        expect(result.success).toBe(true);

        const sql = String(vi.mocked(dbModule.query).mock.calls[0]?.[0] || '');
        const params = (vi.mocked(dbModule.query).mock.calls[0]?.[1] || []) as unknown[];

        expect(sql).toContain('s.location_id::text = $3::text');
        expect(params[2]).toBe('loc-1');
    });

    it('deniega detalle de venta fuera del scope', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        } as any);

        const result = await getReceiptDetails('sale-foreign');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('permite detalle para rol global sin filtro de ubicación', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce({
            userId: 'admin-1',
            userName: 'Admin Uno',
            role: 'ADMIN',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [
                { name: 'Paracetamol', quantity: 2, price: 1000, total: 2000 },
            ],
            rowCount: 1,
        } as any);

        const result = await getReceiptDetails('sale-1');

        expect(result.success).toBe(true);
        expect(result.data?.[0].name).toBe('Paracetamol');
    });
});
