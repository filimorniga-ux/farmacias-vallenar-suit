/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { LandingPageContent } from '@/presentation/pages/LandingPageContent';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        login: vi.fn(),
        employees: [],
        user: null,
    };

    const usePharmaStoreMock = function <T>(selector?: (state: typeof pharmaState) => T) {
        return selector ? selector(pharmaState) : (pharmaState as T);
    };

    return {
        pharmaState,
        usePharmaStoreMock,
        getUsersForLogin: vi.fn(async () => ({ success: true, data: [] })),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/actions/login', () => ({
    getUsersForLogin: mocks.getUsersForLogin,
}));

vi.mock('@/actions/pin-recovery-v2', () => ({
    requestPinReset: vi.fn(),
    applyPinReset: vi.fn(),
}));

vi.mock('@/presentation/components/public/PriceCheckerModal', () => ({
    __esModule: true,
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="price-checker-modal">consultor</div> : null),
}));

vi.mock('@/presentation/lib/bootstrapRouteShell', () => ({
    bootstrapRouteShell: vi.fn(),
}));

vi.mock('@/lib/login-resilience', () => ({
    resolveLoginRetryCooldownMs: () => 0,
}));

vi.mock('@/config/brand.config', () => ({
    brand: {
        logoHorizontal: '/logo-test.svg',
        appName: 'Farmacias Vallenar Suit',
    },
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({
            children,
            whileHover: _whileHover,
            whileTap: _whileTap,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            ...props
        }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LandingPageContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const storage = new Map<string, string>();
        const localStorageMock = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
            removeItem: (key: string) => {
                storage.delete(key);
            },
            clear: () => {
                storage.clear();
            },
        };

        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: localStorageMock,
        });
    });

    it('mantiene un primer render estable y luego resuelve la landing desde localStorage', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        const ssrHtml = renderToString(<LandingPageContent navigateTo={vi.fn()} />);
        expect(ssrHtml).toContain('public-context-loader');

        const navigateTo = vi.fn();
        render(<LandingPageContent navigateTo={navigateTo} />);

        await screen.findByText('Administración');
        expect(screen.queryByTestId('public-context-loader')).toBeNull();
        expect(navigateTo).not.toHaveBeenCalledWith('/select-context');
    });

    it('redirige a seleccionar contexto cuando no existe preferencia persistida', async () => {
        const navigateTo = vi.fn();
        render(<LandingPageContent navigateTo={navigateTo} />);

        expect(screen.getByTestId('public-context-loader')).toBeTruthy();

        await waitFor(() => {
            expect(navigateTo).toHaveBeenCalledWith('/select-context');
        });
    });

    it('abre el consultor público sin mostrar modal de seguridad heredado', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        render(<LandingPageContent navigateTo={vi.fn()} />);

        await screen.findByText('Consultor');
        fireEvent.click(screen.getByText('Consultor'));

        expect(screen.getByTestId('price-checker-modal')).toBeTruthy();
        expect(screen.queryByText('Seguridad Admin')).toBeNull();
    });
});
