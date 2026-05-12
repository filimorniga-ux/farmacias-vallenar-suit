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
        findUserForLogin: vi.fn(async () => ({ success: false, error: 'not found', userMessage: 'not found' })),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/actions/login', () => ({
    findUserForLogin: mocks.findUserForLogin,
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
        button: ({
            children,
            whileHover: _whileHover,
            whileTap: _whileTap,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            ...props
        }: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>) => <button {...props}>{children}</button>,
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
        fireEvent.click(screen.getByRole('button', { name: /Consultor/i }));

        expect(screen.getByTestId('price-checker-modal')).toBeTruthy();
        expect(screen.queryByText('Seguridad Admin')).toBeNull();
    });

    it('expone los módulos públicos principales como botones semánticos', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        const { container } = render(<LandingPageContent navigateTo={vi.fn()} />);

        expect(await screen.findByRole('button', { name: /Administración/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Punto de Venta/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Reloj Control/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Fila Virtual/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Logística/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Consultor/i })).toBeTruthy();

        const root = container.firstElementChild;
        expect(root?.className).toContain('min-h-dvh');
        expect(root?.className).toContain('pt-safe');
        expect(root?.className).toContain('pb-safe');
        expect(root?.className).toContain('overflow-x-hidden');
        expect(root?.className).toContain('overflow-y-auto');
    });

    it('no consulta directorio público de usuarios al montar la landing', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        render(<LandingPageContent navigateTo={vi.fn()} />);

        await screen.findByText('Administración');
        expect(mocks.findUserForLogin).not.toHaveBeenCalled();
    });

    it('autoformatea el RUT al buscar usuario sin directorio público', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        render(<LandingPageContent navigateTo={vi.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: /Administración/i }));

        const rutInput = await screen.findByPlaceholderText('Ingrese su RUT') as HTMLInputElement;
        fireEvent.change(rutInput, { target: { value: '22222222' } });
        expect(rutInput.value).toBe('2.222.222-2');

        fireEvent.change(rutInput, { target: { value: '222222222' } });
        expect(rutInput.value).toBe('22.222.222-2');

        fireEvent.click(screen.getByRole('button', { name: /Buscar por RUT/i }));

        await waitFor(() => {
            expect(mocks.findUserForLogin).toHaveBeenCalledWith(expect.objectContaining({
                identifier: '22.222.222-2',
                locationId: 'loc-1',
            }));
        });
    });

    it('mantiene el modal de login scrolleable para viewport móvil landscape', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        render(<LandingPageContent navigateTo={vi.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: /Administración/i }));

        const title = await screen.findByRole('heading', { name: /Iniciar Sesión/i });
        const modal = title.closest('.max-w-md');
        expect(modal?.className).toContain('max-h-[calc(100dvh-1.5rem)]');
        expect(modal?.className).toContain('overflow-y-auto');
        expect(modal?.className).toContain('p-5');
        expect(modal?.parentElement?.className).toContain('items-start');
        expect(modal?.parentElement?.className).toContain('overflow-y-auto');
    });

    it('abre la pantalla de fila sin persistir una sucursal operativa en localStorage', async () => {
        localStorage.setItem('preferred_location_id', 'loc-1');
        localStorage.setItem('preferred_location_name', 'Sucursal Centro');
        localStorage.setItem('preferred_location_type', 'STORE');

        const locationAssignMock = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                href: '',
                assign: locationAssignMock,
            },
        });

        render(<LandingPageContent navigateTo={vi.fn()} />);

        await screen.findByText('Fila Virtual');
        fireEvent.click(screen.getByText('Fila Virtual'));

        const title = await screen.findByRole('heading', { name: /Sistema de Filas/i });
        const modal = title.closest('.max-w-md');

        expect(modal?.className).toContain('max-h-[calc(100dvh-1.5rem)]');
        expect(modal?.className).toContain('overflow-y-auto');
        expect(modal?.parentElement?.className).toContain('items-start');
        expect(modal?.parentElement?.className).toContain('overflow-y-auto');

        fireEvent.click(screen.getByText('Activar Pantalla'));

        expect(localStorage.getItem('queue_display_location_id')).toBeNull();
        expect(String(window.location.href)).toBe('/display/queue');
    });
});
