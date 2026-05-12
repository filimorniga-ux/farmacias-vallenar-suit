import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPoolQuery = vi.fn();
const mockGetValidatedSession = vi.fn();

vi.mock('@/lib/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: (...args: unknown[]) => mockGetValidatedSession(...args),
}));

import { searchProductsForEditSecure, searchProductsSecure } from '@/actions/search-actions';

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440040';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440099';

describe('search-actions - searchProductsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440011',
            role: 'WAREHOUSE',
            locationId: VALID_LOCATION_ID,
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token-warehouse',
        });
    });

    it('rechaza búsquedas sin sesión antes de consultar productos', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const res = await searchProductsSecure('para');

        expect(res.success).toBe(false);
        expect(res.error).toContain('autenticado');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('rechaza roles sin acceso a inventario', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440012',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token-cashier',
        });

        const res = await searchProductsSecure('para');

        expect(res.success).toBe(false);
        expect(res.error).toContain('Acceso denegado');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('rechaza términos vacíos después de recortar espacios', async () => {
        const res = await searchProductsSecure('   ');

        expect(res.success).toBe(false);
        expect(res.data).toEqual([]);
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('acota el stock a la ubicación del actor no global', async () => {
        mockPoolQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'prod-1',
                    sku: 'PARA-500',
                    name: 'Paracetamol',
                    barcode: '780000000001',
                    stock_actual: 8,
                    price: 1500,
                },
            ],
        });

        const res = await searchProductsSecure('para');

        expect(res.success).toBe(true);
        expect(res.data?.[0]).toMatchObject({
            sku: 'PARA-500',
            stock_actual: 8,
        });
        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.stringContaining('p.id::text = ib.product_id::text'),
            ['%para%', 'para', VALID_LOCATION_ID],
        );
        const sql = String(mockPoolQuery.mock.calls[0][0]);
        expect(sql).toContain('ib.location_id::text = $3::text');
        expect(sql).toContain("NULLIF(to_jsonb(ib)->>'barcode', '')");
        expect(sql).not.toMatch(/\bib\.barcode\b/);
    });

    it('permite búsqueda global solo a roles globales', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440013',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token-admin',
        });
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        const res = await searchProductsSecure('para');

        expect(res.success).toBe(true);
        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.any(String),
            ['%para%', 'para', null],
        );
    });
});

describe('search-actions - searchProductsForEditSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440010',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token-1',
        });
    });

    it('rechaza búsquedas sin actor autenticado', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const res = await searchProductsForEditSecure('para', VALID_LOCATION_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('autenticado');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('rechaza location fuera del scope del actor', async () => {
        const res = await searchProductsForEditSecure('para', OTHER_LOCATION_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('otra ubicación');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('usa la ubicación scoped para la búsqueda de productos editables', async () => {
        mockPoolQuery.mockResolvedValueOnce({
            rows: [
                {
                    batch_id: '550e8400-e29b-41d4-a716-446655440050',
                    sku: 'PARA-500',
                    name: 'Paracetamol',
                    price: 1500,
                    stock: 10,
                },
            ],
        });

        const res = await searchProductsForEditSecure('para', VALID_LOCATION_ID);

        expect(res.success).toBe(true);
        expect(res.data?.[0]?.sku).toBe('PARA-500');
        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.stringContaining('WHERE ib.location_id = $1::uuid'),
            [VALID_LOCATION_ID, '%para%', 'para'],
        );
        const sql = String(mockPoolQuery.mock.calls[0][0]);
        expect(sql).toContain("NULLIF(to_jsonb(ib)->>'barcode', '')");
        expect(sql).toContain("NULLIF(to_jsonb(ib)->>'unit_price', '')::numeric");
        expect(sql).not.toMatch(/\bib\.(barcode|unit_price)\b/);
    });
});
