import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPoolQuery = vi.fn();
const mockGetSessionSecure = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
        connect: vi.fn(),
    },
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: () => mockGetSessionSecure(),
}));

import {
    getSupplierSecure,
    getSuppliersListSecure,
} from '@/actions/suppliers-v2';

describe('Suppliers V2 Auth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: 'user-1',
            role: 'MANAGER',
            userName: 'Manager',
        });
    });

    it('rechaza listado sin sesión', async () => {
        mockGetSessionSecure.mockResolvedValueOnce(null);

        const result = await getSuppliersListSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sin permisos');
    });

    it('rechaza detalle sin sesión', async () => {
        mockGetSessionSecure.mockResolvedValueOnce(null);

        const result = await getSupplierSecure('550e8400-e29b-41d4-a716-446655440001');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sin permisos');
    });

    it('permite listado autenticado del catálogo', async () => {
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{
                id: '550e8400-e29b-41d4-a716-446655440001',
                business_name: 'Proveedor Uno',
                fantasy_name: '',
                metadata: {
                    bank_account: null,
                    contacts: [],
                    brands: [],
                },
                payment_terms: 'CONTADO',
                lead_time_days: 7,
            }],
            rowCount: 1,
        });

        const result = await getSuppliersListSecure();

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
    });
});
