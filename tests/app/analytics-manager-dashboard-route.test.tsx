import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const {
    mockGetValidatedSession,
    mockRedirect,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mockRedirect(path),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/actions/admin-scope', () => ({
    ANALYTICS_PAGE_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/presentation/components/analytics/ExecutiveDashboard', () => ({
    __esModule: true,
    default: () => <div data-testid="executive-dashboard" />,
}));

import ManagerDashboardPage from '@/app/analytics/manager-dashboard/page';

describe('/app/analytics/manager-dashboard/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige si no hay sesión validada', async () => {
        mockGetValidatedSession.mockResolvedValue(null);

        await expect(ManagerDashboardPage()).rejects.toThrow('NEXT_REDIRECT:/');

        expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('redirige si el rol no tiene acceso a analytics ejecutivo', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        await expect(ManagerDashboardPage()).rejects.toThrow('NEXT_REDIRECT:/');

        expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('renderiza dashboard ejecutivo para rol autorizado', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'manager-1',
            role: 'manager',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const page = await ManagerDashboardPage();

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(JSON.stringify(page as ReactElement)).toContain('Dashboard Ejecutivo');
    });
});
