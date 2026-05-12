import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const {
    getValidatedSessionMock,
    requireProcurementActorMock,
    redirectMock,
} = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    requireProcurementActorMock: vi.fn(),
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

vi.mock('@/actions/procurement-scope', () => ({
    SUPPLIER_CATALOG_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    requireProcurementActor: (...args: unknown[]) => requireProcurementActorMock(...args),
}));

vi.mock('@/app/suppliers/SuppliersClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="suppliers-client-page" />,
}));

import SuppliersRoutePage from '@/app/suppliers/page';
import SupplierProfileRoutePage from '@/app/suppliers/[id]/page';
import SuppliersClientPage from '@/app/suppliers/SuppliersClientPage';
import ProveedoresPage from '@/app/proveedores/page';

describe('/suppliers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getValidatedSessionMock.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        requireProcurementActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
    });

    it('redirige a login si no hay sesión validada', async () => {
        getValidatedSessionMock.mockResolvedValueOnce(null);

        await expect(SuppliersRoutePage()).rejects.toThrow('REDIRECT:/login');

        expect(requireProcurementActorMock).not.toHaveBeenCalled();
        expect(redirectMock).toHaveBeenCalledWith('/login');
    });

    it('redirige al inicio si el actor no puede ver el catálogo de proveedores', async () => {
        requireProcurementActorMock.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(SuppliersRoutePage()).rejects.toThrow('REDIRECT:/');

        expect(redirectMock).toHaveBeenCalledWith('/');
    });

    it('renderiza el directorio de proveedores como superficie App Router', async () => {
        const page = await SuppliersRoutePage();

        expect(redirectMock).not.toHaveBeenCalled();
        expect((page as ReactElement).type).toBe(SuppliersClientPage);
    });

    it('renderiza el perfil de proveedor en la subruta App Router', async () => {
        const page = await SupplierProfileRoutePage();

        expect(redirectMock).not.toHaveBeenCalled();
        expect((page as ReactElement).type).toBe(SuppliersClientPage);
    });

    it('mantiene /proveedores como alias explícito hacia el directorio', () => {
        expect(() => ProveedoresPage()).toThrow('REDIRECT:/suppliers');
        expect(redirectMock).toHaveBeenCalledWith('/suppliers');
    });
});
