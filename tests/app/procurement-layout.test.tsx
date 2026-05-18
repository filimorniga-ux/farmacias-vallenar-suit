/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetValidatedSession,
    mockRedirect,
    mockRequireProcurementActor,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
    mockRequireProcurementActor: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/actions/procurement-scope', () => ({
    PROCUREMENT_READ_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    requireProcurementActor: (...args: unknown[]) => mockRequireProcurementActor(...args),
}));

vi.mock('@/presentation/layouts/NextSidebarLayout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid="next-sidebar-layout">{children}</div>
    ),
}));

import ProcurementLayout from '@/app/procurement/layout';

describe('/app/procurement/layout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige a login sin sesión antes de montar superficies procurement', async () => {
        mockGetValidatedSession.mockResolvedValue(null);

        await expect(ProcurementLayout({ children: <div>procurement</div> })).rejects.toThrow('NEXT_REDIRECT');

        expect(mockRedirect).toHaveBeenCalledWith('/login');
        expect(mockRequireProcurementActor).not.toHaveBeenCalled();
    });

    it('redirige al deny canónico si el actor procurement no está autorizado', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockRequireProcurementActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(ProcurementLayout({ children: <div>procurement</div> })).rejects.toThrow('NEXT_REDIRECT');

        expect(mockRedirect).toHaveBeenCalledWith('/');
        expect(mockRequireProcurementActor).toHaveBeenCalledWith(
            ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
            'procurement-layout',
        );
    });

    it('monta el shell App Router solo con actor procurement válido', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockRequireProcurementActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
            },
        });

        const result = await ProcurementLayout({ children: <div>procurement</div> });

        render(result as ReactElement);

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(screen.getByTestId('next-sidebar-layout').textContent).toContain('procurement');
    });
});
