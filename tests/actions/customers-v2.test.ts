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

    it('no escribe PII del cliente en logs de creación', async () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        mockConnectQuery
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});

        try {
            const result = await customersV2.createCustomerSecure({
                rut: '12.345.678-5',
                fullName: 'Paciente Reservado',
                phone: '+56912345678',
                email: 'paciente@example.com',
                address: 'Av. Prueba 123',
                tags: ['preferente'],
                healthTags: ['hipertension'],
                notes: 'Dato clínico sensible',
                registrationSource: 'POS',
            });
            await Promise.resolve();

            const logOutput = [
                ...infoSpy.mock.calls,
                ...logSpy.mock.calls,
                ...errorSpy.mock.calls,
            ].flat().map(String).join('\n');

            expect(result.success).toBe(true);
            expect(logOutput).not.toContain('12.345.678-5');
            expect(logOutput).not.toContain('12345678-5');
            expect(logOutput).not.toContain('paciente@example.com');
            expect(logOutput).not.toContain('+56912345678');
            expect(logOutput).not.toContain('Av. Prueba 123');
            expect(logOutput).not.toContain('Dato clínico sensible');
        } finally {
            infoSpy.mockRestore();
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });
});
