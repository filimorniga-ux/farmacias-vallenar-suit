import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn(async () => mockClient),
        query: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { getValidatedSession } from '@/lib/server-session';
import {
    createProductSecure,
    quickCreateProductSecure,
    updateProductMasterSecure,
} from '@/actions/products-v2';

describe('Products V2 - server-side session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza crear producto sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await createProductSecure({
            sku: 'ABC123',
            name: 'Producto Test',
            price: 1000,
            userId: '550e8400-e29b-41d4-a716-446655440000',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('usa el userId de sesión para la auditoría y no el userId del payload', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'session-admin',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // sku uniqueness
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // insert product
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await createProductSecure({
            sku: 'ABC123',
            name: 'Producto Test',
            price: 1000,
            userId: '550e8400-e29b-41d4-a716-446655440123',
        });

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['session-admin'])
        );
    });

    it('usa session.role para bypass de manager y no el userId del payload', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({
                rows: [{ id: 'prod-1', price: 1000, cost_net: 500, name: 'Prod' }],
                rowCount: 1,
            }) // current product
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update product
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await updateProductMasterSecure({
            productId: '550e8400-e29b-41d4-a716-446655440099',
            userId: '550e8400-e29b-41d4-a716-446655440124',
            price: 1400,
        });

        expect(result.success).toBe(true);
        expect(mockClient.query).not.toHaveBeenCalledWith(
            'SELECT role FROM users WHERE id = $1',
            ['spoofed-user']
        );
    });

    it('quickCreateProductSecure exige sesión válida server-side', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await quickCreateProductSecure({
            name: 'Producto Rápido',
            sku: 'SKU123',
            costPrice: 500,
            salePrice: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });
});
