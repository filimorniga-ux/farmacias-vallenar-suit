import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const {
    getValidatedSessionMock,
    requireCustomerActorMock,
    redirectMock,
} = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    requireCustomerActorMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: getValidatedSessionMock,
}));

vi.mock('@/actions/customer-scope', () => ({
    CUSTOMER_DIRECTORY_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
    requireCustomerActor: (...args: unknown[]) => requireCustomerActorMock(...args),
}));

vi.mock('@/app/clients/ClientsClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="clients-client-page" />,
}));

import ClientsRoutePage from '@/app/clients/page';
import ClientsClientPage from '@/app/clients/ClientsClientPage';

describe('/clients', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getValidatedSessionMock.mockResolvedValue({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        requireCustomerActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
    });

    it('redirige a login si no hay sesión validada', async () => {
        getValidatedSessionMock.mockResolvedValueOnce(null);

        await expect(ClientsRoutePage()).rejects.toThrow('REDIRECT:/login');

        expect(requireCustomerActorMock).not.toHaveBeenCalled();
        expect(redirectMock).toHaveBeenCalledWith('/login');
    });

    it('redirige al inicio si el actor no puede ver el directorio global de clientes', async () => {
        requireCustomerActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(ClientsRoutePage()).rejects.toThrow('REDIRECT:/');

        expect(requireCustomerActorMock).toHaveBeenCalledWith(['ADMIN', 'GERENTE_GENERAL'], 'clients-route-page');
        expect(redirectMock).toHaveBeenCalledWith('/');
    });

    it('renderiza el directorio de clientes como superficie App Router para roles globales', async () => {
        const page = await ClientsRoutePage();

        expect(redirectMock).not.toHaveBeenCalled();
        expect(requireCustomerActorMock).toHaveBeenCalledWith(['ADMIN', 'GERENTE_GENERAL'], 'clients-route-page');
        expect((page as ReactElement).type).toBe(ClientsClientPage);
    });
});
