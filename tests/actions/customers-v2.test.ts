import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPoolQuery, mockConnectQuery, mockRelease, requireCustomerActorMock, canUseGlobalCustomerDirectoryMock } = vi.hoisted(() => ({
    mockPoolQuery: vi.fn(),
    mockConnectQuery: vi.fn(),
    mockRelease: vi.fn(),
    requireCustomerActorMock: vi.fn(),
    canUseGlobalCustomerDirectoryMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    pool: {
        query: mockPoolQuery,
        connect: vi.fn().mockResolvedValue({
            query: mockConnectQuery,
            release: mockRelease,
        }),
    },
}));

vi.mock('@/actions/customer-scope', () => ({
    CUSTOMER_CREATE_ROLES: ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'],
    CUSTOMER_DIRECTORY_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    CUSTOMER_EXPORT_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    CUSTOMER_LOOKUP_ROLES: ['CASHIER', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    CUSTOMER_WRITE_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    requireCustomerActor: requireCustomerActorMock,
    canUseGlobalCustomerDirectory: canUseGlobalCustomerDirectoryMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440099') }));

import * as customersV2 from '@/actions/customers-v2';

describe('Customers V2 hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireCustomerActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: '550e8400-e29b-41d4-a716-446655440001',
                role: 'ADMIN',
                locationId: '550e8400-e29b-41d4-a716-446655440010',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
        canUseGlobalCustomerDirectoryMock.mockReturnValue(true);
    });

    it('rechaza lectura sin auth', async () => {
        requireCustomerActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Sesión no válida. Vuelve a iniciar sesión.',
        });

        const result = await customersV2.getCustomersSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('para actores no globales no lista el directorio completo sin búsqueda explícita', async () => {
        canUseGlobalCustomerDirectoryMock.mockReturnValueOnce(false);

        const result = await customersV2.getCustomersSecure();

        expect(result.success).toBe(true);
        expect(result.data?.customers).toEqual([]);
        expect(result.data?.total).toBe(0);
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('rechaza soft-delete sin permiso real', async () => {
        requireCustomerActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await customersV2.deleteCustomerSecure('550e8400-e29b-41d4-a716-446655440010', 'spoofed-user');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(mockConnectQuery).not.toHaveBeenCalled();
    });

    it('rechaza export GDPR sin permiso', async () => {
        requireCustomerActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await customersV2.exportCustomerDataSecure('550e8400-e29b-41d4-a716-446655440010');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });
});
