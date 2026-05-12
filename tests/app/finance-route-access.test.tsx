/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

const {
    mockRequireScopedActor,
    mockRedirect,
} = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: (...args: unknown[]) => mockRequireScopedActor(...args),
}));

vi.mock('@/presentation/layouts/NextSidebarLayout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid="next-sidebar-layout">{children}</div>
    ),
}));

import FinanceLayout from '@/app/finance/layout';
import TreasuryLayout from '@/app/finance/treasury/layout';
import MonthlyClosingLayout from '@/app/finance/monthly-closing/layout';

describe('/app/finance entrypoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mantiene el shell de navegación App Router para finanzas canónicas', () => {
        const result = FinanceLayout({ children: <div>finance content</div> });

        render(result as ReactElement);

        expect(screen.getByTestId('next-sidebar-layout').textContent).toContain('finance content');
    });

    it('redirige tesorería si el actor no está autorizado', async () => {
        mockRequireScopedActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(TreasuryLayout({ children: <div>treasury</div> })).rejects.toThrow('NEXT_REDIRECT');
    });

    it('permite tesorería para TESORERO', async () => {
        mockRequireScopedActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'tesorero-1',
                role: 'TESORERO',
                locationId: 'loc-1',
                userName: 'Tesorero',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        const result = await TreasuryLayout({ children: <div>treasury</div> });

        expect(mockRedirect).not.toHaveBeenCalled();
        expect((result as any).props.children).toBe('treasury');
    });

    it('redirige cierre mensual si el actor no está autorizado', async () => {
        mockRequireScopedActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(MonthlyClosingLayout({ children: <div>closing</div> })).rejects.toThrow('NEXT_REDIRECT');
    });

    it('permite cierre mensual para MANAGER', async () => {
        mockRequireScopedActor.mockResolvedValue({
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

        const result = await MonthlyClosingLayout({ children: <div>closing</div> });

        expect(mockRedirect).not.toHaveBeenCalled();
        expect((result as any).props.children).toBe('closing');
    });
});
