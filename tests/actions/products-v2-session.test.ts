import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, PinRbacError } = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
        PinRbacError: MockPinRbacError,
    };
});

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    requireRole: vi.fn((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }

        return actor;
    }),
    validatePinForRoles: vi.fn(),
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
    },
    PinRbacError,
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

import { getActorOrFail, validatePinForRoles } from '@/lib/pin-rbac';
import {
    createProductSecure,
    deactivateProductSecure,
    quickCreateProductSecure,
    updateProductMasterSecure,
} from '@/actions/products-v2';

describe('Products V2 - server-side session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getActorOrFail).mockResolvedValue({
            userId: 'session-admin',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(validatePinForRoles).mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: 'admin-1',
                name: 'Admin Aprobador',
                role: 'ADMIN',
            },
            matchedBy: 'hash',
        });
    });

    it('rechaza crear producto sin sesión válida', async () => {
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

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
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
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
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
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
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await quickCreateProductSecure({
            name: 'Producto Rápido',
            sku: 'SKU123',
            costPrice: 500,
            salePrice: 1000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('deactivateProductSecure usa el helper compartido de PIN admin', async () => {
        vi.mocked(validatePinForRoles).mockResolvedValueOnce({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce(undefined); // ROLLBACK

        const result = await deactivateProductSecure({
            productId: '550e8400-e29b-41d4-a716-446655440099',
            reason: 'Producto obsoleto y retirado',
            adminPin: '1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN inválido');
        expect(validatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({ allowLegacyPlaintext: true })
        );
    });
});
