import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockQuery,
    mockRelease,
    mockGetClient,
    mockRequireInventoryActor,
    mockEnsureBatchInInventoryScope,
    mockEnsureProductInInventoryScope,
    mockValidatePinForRoles,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockRelease: vi.fn(),
    mockGetClient: vi.fn(),
    mockRequireInventoryActor: vi.fn(),
    mockEnsureBatchInInventoryScope: vi.fn(),
    mockEnsureProductInInventoryScope: vi.fn(),
    mockValidatePinForRoles: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    getClient: mockGetClient,
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/actions/inventory-scope', () => ({
    INVENTORY_DELETE_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    hasGlobalInventoryScope: (role: string) => role === 'ADMIN' || role === 'GERENTE_GENERAL',
    requireInventoryActor: (...args: unknown[]) => mockRequireInventoryActor(...args),
    ensureBatchInInventoryScope: (...args: unknown[]) => mockEnsureBatchInInventoryScope(...args),
    ensureProductInInventoryScope: (...args: unknown[]) => mockEnsureProductInInventoryScope(...args),
}));

vi.mock('@/lib/pin-rbac', () => ({
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
}));

import { deleteProductSecure } from '@/actions/delete-product';

describe('deleteProductSecure (Check-First Strategy)', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = '123e4567-e89b-12d3-a456-426614174001';
    const pin = '1234';

    beforeEach(() => {
        vi.clearAllMocks();

        mockGetClient.mockResolvedValue({
            query: mockQuery,
            release: mockRelease,
        });

        mockRequireInventoryActor.mockResolvedValue({
            success: true,
            actor: {
                userId,
                role: 'ADMIN',
                locationId: '123e4567-e89b-12d3-a456-426614174010',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: 'admin-1',
                name: 'Admin',
                role: 'ADMIN',
            },
        });

        mockEnsureBatchInInventoryScope.mockResolvedValue({
            success: false,
            error: 'Lote no encontrado',
        });

        mockEnsureProductInInventoryScope.mockResolvedValue({
            success: true,
            product: { id: productId, location_id: '123e4567-e89b-12d3-a456-426614174010' },
            locationId: '123e4567-e89b-12d3-a456-426614174010',
        });
    });

    it('should reject missing authenticated actor', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: false,
            error: 'Sesión no válida. Vuelve a iniciar sesión.',
        });

        const result = await deleteProductSecure(productId, userId, pin);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión');
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('should perform SOFT DELETE when product has sales history', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rowCount: 1 }) // dependencies
            .mockResolvedValueOnce({ rowCount: 1 }) // update products
            .mockResolvedValueOnce({ rowCount: 1 }) // update batches
            .mockResolvedValueOnce({}) // audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await deleteProductSecure(productId, userId, pin);

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenLastCalledWith('COMMIT');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE products'),
            [productId],
        );
    });

    it('should perform HARD DELETE when product has no sales', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rowCount: 0 }) // dependencies
            .mockResolvedValueOnce({ rowCount: 0 }) // delete batches
            .mockResolvedValueOnce({ rowCount: 1 }) // delete product
            .mockResolvedValueOnce({}) // audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await deleteProductSecure(productId, userId, pin);

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM inventory_batches WHERE product_id::text = $1::text',
            [productId],
        );
        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM products WHERE id::text = $1::text',
            [productId],
        );
    });

    it('should reject product with lots outside actor scope', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: true,
            actor: {
                userId,
                role: 'MANAGER',
                locationId: '123e4567-e89b-12d3-a456-426614174010',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rowCount: 1 }); // out-of-scope lots

        const result = await deleteProductSecure(productId, userId, pin);

        expect(result.success).toBe(false);
        expect(result.error).toContain('fuera de tu ubicación');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });
});
