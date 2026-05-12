/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

const { userRoleMock } = vi.hoisted(() => ({
    userRoleMock: { current: 'MANAGER' },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
    default: ({
        children,
        href,
        prefetch,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
        <a href={href} data-prefetch={prefetch === undefined ? 'default' : String(prefetch)} {...props}>{children}</a>
    ),
}));

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
            const { layoutId, ...domProps } = props as React.HTMLAttributes<HTMLElement> & { layoutId?: string };
            void layoutId;
            return <aside {...domProps}>{children}</aside>;
        },
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
            const { layoutId, ...domProps } = props as React.HTMLAttributes<HTMLDivElement> & { layoutId?: string };
            void layoutId;
            return <div {...domProps}>{children}</div>;
        },
    },
}));

vi.mock('@/presentation/components/layout/ContextBadge', () => ({
    default: () => <div data-testid="context-badge" />,
}));

vi.mock('@/presentation/components/layout/LocationSwitcher', () => ({
    default: ({ variant }: { variant?: string }) => <div data-testid="location-switcher" data-variant={variant || 'default'} />,
}));

vi.mock('@/presentation/components/ui/AppIcon', () => ({
    __esModule: true,
    default: () => <div data-testid="app-icon" />,
}));

vi.mock('@/presentation/components/ui/SyncStatusIndicator', () => ({
    default: () => <div data-testid="sync-status" />,
}));

vi.mock('@/presentation/components/notifications/NotificationBell', () => ({
    default: () => <div data-testid="notification-bell" />,
}));

vi.mock('@/presentation/components/notifications/NotificationBellRuntime', () => ({
    default: () => <div data-testid="notification-bell-runtime" />,
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector: (state: {
        user: { name: string; role: string };
        logout: () => void;
    }) => unknown) => selector({
        user: { name: 'Gerente General 1', role: userRoleMock.current },
        logout: vi.fn(),
    }),
}));

describe('NextSidebarLayout', () => {
    beforeEach(() => {
        userRoleMock.current = 'MANAGER';
    });

    it('monta una sola instancia real del notification bell y un solo runtime', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getAllByTestId('notification-bell')).toHaveLength(1);
        expect(screen.getAllByTestId('notification-bell-runtime')).toHaveLength(1);
    });

    it('desactiva prefetch automático en rutas pesadas del sidebar', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getByRole('link', { name: /inventario/i }).getAttribute('data-prefetch')).toBe('false');
        expect(screen.getByRole('link', { name: /punto de venta/i }).getAttribute('data-prefetch')).toBe('false');
        expect(screen.getByRole('link', { name: /resumen general/i }).getAttribute('data-prefetch')).toBe('default');
        expect(screen.getByRole('link', { name: /tesorería/i }).getAttribute('data-prefetch')).toBe('default');
    });

    it('mantiene el menú principal accesible en header móvil', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        const menuButton = screen.getByRole('button', { name: /Abrir menú principal/i });
        expect(menuButton.className).toContain('min-h-11');
        expect(menuButton.className).not.toContain('hidden md:block');
    });

    it('usa location switcher compacto en header móvil', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        const mobileSwitcher = screen.getAllByTestId('location-switcher')[0];
        expect(mobileSwitcher.getAttribute('data-variant')).toBe('compact');
        expect(mobileSwitcher.parentElement?.className).toContain('hidden');
        expect(mobileSwitcher.parentElement?.className).toContain('sm:block');
    });

    it('usa label global de producto sin versión visible ni Suit Enterprise', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getByText('Farmacias Vallenar Suite')).toBeTruthy();
        expect(screen.queryByText(/v2\.1/i)).toBeNull();
        expect(screen.queryByText(/Suit Enterprise/i)).toBeNull();
    });

    it('apunta Recursos Humanos a la ruta App Router canónica', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getByRole('link', { name: /recursos humanos/i }).getAttribute('href')).toBe('/rrhh');
    });

    it('expone Clientes CRM solo para roles con directorio global de clientes', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.queryByRole('link', { name: /clientes/i })).toBeNull();

        userRoleMock.current = 'GERENTE_GENERAL';
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getByRole('link', { name: /clientes/i }).getAttribute('href')).toBe('/clients');
    });
});
