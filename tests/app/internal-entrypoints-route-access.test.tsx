import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    requireInventoryActorMock: vi.fn(),
    requireProcurementActorMock: vi.fn(),
    requireScopedActorMock: vi.fn(),
    redirectMock: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mocks.redirectMock(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: mocks.getValidatedSessionMock,
}));

vi.mock('@/actions/inventory-scope', () => ({
    INVENTORY_READ_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    requireInventoryActor: (...args: unknown[]) => mocks.requireInventoryActorMock(...args),
}));

vi.mock('@/actions/procurement-scope', () => ({
    PROCUREMENT_READ_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    requireProcurementActor: (...args: unknown[]) => mocks.requireProcurementActorMock(...args),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: (...args: unknown[]) => mocks.requireScopedActorMock(...args),
}));

vi.mock('@/app/inventory/InventoryClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="inventory-client-page" />,
}));

vi.mock('@/app/supply-chain/SupplyChainClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="supply-chain-client-page" />,
}));

vi.mock('@/components/auth/RouteGuard', () => ({
    __esModule: true,
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/logistica/AddPurchaseButton', () => ({
    __esModule: true,
    default: () => <div data-testid="add-purchase-button" />,
}));

vi.mock('@/components/procurement/UnifiedPriceConsultant', () => ({
    __esModule: true,
    default: () => <div data-testid="unified-price-consultant" />,
}));

vi.mock('@/presentation/components/reports/InventoryExportForm', () => ({
    InventoryExportForm: () => <div data-testid="inventory-export-form" />,
}));

vi.mock('@/presentation/components/ui/SyncStatusBadge', () => ({
    SyncStatusBadge: () => <div data-testid="sync-status-badge" />,
}));

import InventoryRoutePage from '@/app/inventory/page';
import SupplyChainRoutePage from '@/app/supply-chain/page';
import LogisticaPage from '@/app/logistica/page';

describe('internal legacy entrypoints hardened server-side', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige /inventory a login sin sesión y no delega el boundary al cliente', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(InventoryRoutePage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
        expect(mocks.requireInventoryActorMock).not.toHaveBeenCalled();
    });

    it('redirige /inventory al deny canónico si el rol no está autorizado', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            locationId: 'loc-1',
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireInventoryActorMock.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(InventoryRoutePage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('permite /inventory con actor válido', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            locationId: 'loc-1',
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireInventoryActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'warehouse-1',
                role: 'WAREHOUSE',
                locationId: 'loc-1',
            },
        });

        const result = await InventoryRoutePage();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });

    it('redirige /supply-chain a login sin sesión', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(SupplyChainRoutePage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
        expect(mocks.requireProcurementActorMock).not.toHaveBeenCalled();
    });

    it('redirige /supply-chain al deny canónico si el actor no está autorizado', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            locationId: 'loc-1',
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireProcurementActorMock.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(SupplyChainRoutePage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('permite /supply-chain con actor válido', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireProcurementActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
            },
        });

        const result = await SupplyChainRoutePage();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });

    it('redirige /logistica a login sin sesión y evita auth cliente como boundary real', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(LogisticaPage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
        expect(mocks.requireScopedActorMock).not.toHaveBeenCalled();
    });

    it('redirige /logistica al deny canónico si el actor no tiene rol permitido', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireScopedActorMock.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(LogisticaPage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('permite /logistica con actor válido', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mocks.requireScopedActorMock.mockResolvedValue({
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

        const result = await LogisticaPage();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });
});
