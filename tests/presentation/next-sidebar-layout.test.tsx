/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
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
    default: () => <div data-testid="location-switcher" />,
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
        user: { name: 'Gerente General 1', role: 'MANAGER' },
        logout: vi.fn(),
    }),
}));

describe('NextSidebarLayout', () => {
    it('monta una sola instancia real del notification bell y un solo runtime', () => {
        render(
            <NextSidebarLayout>
                <div>contenido</div>
            </NextSidebarLayout>
        );

        expect(screen.getAllByTestId('notification-bell')).toHaveLength(1);
        expect(screen.getAllByTestId('notification-bell-runtime')).toHaveLength(1);
    });
});
