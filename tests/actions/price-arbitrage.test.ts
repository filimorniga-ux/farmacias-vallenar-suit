import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionSecure } from '@/actions/auth-v2';
import { searchUnifiedProducts } from '@/actions/analytics/price-arbitrage';

const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

describe('price-arbitrage visibility contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({
            rows: [
                {
                    id: 'row-1',
                    source_file: 'santiago.xlsx',
                    raw_branch: 'Sucursal Santiago',
                    raw_title: 'Paracetamol 500',
                    raw_price: 1500,
                    raw_stock: 10,
                    raw_sku: 'SKU-1',
                    raw_isp_code: 'ISP-1',
                    target_product_id: null,
                    created_at: new Date('2026-01-01T00:00:00.000Z'),
                    raw_active_principle: 'Paracetamol',
                    raw_misc: {},
                    canonical_name: null,
                    canonical_barcode: null,
                    is_bioequivalent: false,
                    dci: null,
                    units_per_box: 20,
                    category_name: null,
                    lab_name: null,
                    action_name: null,
                },
                {
                    id: 'row-2',
                    source_file: 'golan.xlsx',
                    raw_branch: null,
                    raw_title: 'Paracetamol 500',
                    raw_price: 1000,
                    raw_stock: 20,
                    raw_sku: 'SKU-1',
                    raw_isp_code: 'ISP-1',
                    target_product_id: null,
                    created_at: new Date('2026-01-01T00:00:00.000Z'),
                    raw_active_principle: 'Paracetamol',
                    raw_misc: {},
                    canonical_name: null,
                    canonical_barcode: null,
                    is_bioequivalent: false,
                    dci: null,
                    units_per_box: 20,
                    category_name: null,
                    lab_name: null,
                    action_name: null,
                },
            ],
        });
    });

    it('recorta costos y márgenes cuando el contrato es público', async () => {
        const results = await searchUnifiedProducts('para', undefined, 'PUBLIC');

        expect(results).toHaveLength(1);
        expect(results[0]?.offerings).toHaveLength(1);
        expect(results[0]?.offerings[0]?.type).toBe('BRANCH');
        expect(results[0]?.maxMargin).toBe(0);
        expect(results[0]?.alerts).toEqual([]);
    });

    it('cae a contrato público cuando la sesión no tiene rol interno', async () => {
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
        } as any);

        const results = await searchUnifiedProducts('para');

        expect(results[0]?.offerings).toHaveLength(1);
        expect(results[0]?.maxMargin).toBe(0);
    });

    it('mantiene el contrato interno para roles autorizados', async () => {
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'user-2',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
        } as any);

        const results = await searchUnifiedProducts('para');

        expect(results[0]?.offerings).toHaveLength(2);
        expect(results[0]?.maxMargin).toBe(500);
    });
});
