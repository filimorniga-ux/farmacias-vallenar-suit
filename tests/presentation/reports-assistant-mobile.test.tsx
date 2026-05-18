/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ReportsAssistant from '@/presentation/components/reports/ReportsAssistant';

const mocks = vi.hoisted(() => ({
    pharmaState: { currentLocationId: 'loc-1' },
    locationState: { locations: [{ id: 'loc-1', name: 'Sucursal Centro' }] },
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: (selector?: (state: typeof mocks.pharmaState) => unknown) =>
        selector ? selector(mocks.pharmaState) : mocks.pharmaState,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector?: (state: typeof mocks.locationState) => unknown) =>
        selector ? selector(mocks.locationState) : mocks.locationState,
}));

vi.mock('@/actions/analytics/ai-reports-assistant', () => ({
    askReportsAssistant: vi.fn(),
}));

vi.mock('framer-motion', () => ({
    motion: {
        button: ({
            children,
            whileHover: _whileHover,
            whileTap: _whileTap,
            ...props
        }: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>) => <button {...props}>{children}</button>,
        div: ({
            children,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            ...props
        }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ReportsAssistant mobile layout', () => {
    it('usa viewport móvil, safe area y controles táctiles al abrir el asistente', () => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            value: vi.fn(),
            configurable: true,
        });

        render(<ReportsAssistant />);

        const toggle = screen.getByRole('button', { name: /Abrir asistente de reportes/i });
        expect(toggle.className).toContain('safe-area-inset-bottom');
        expect(toggle.className).toContain('min-h-14');

        fireEvent.click(toggle);

        const dialog = screen.getByRole('dialog', { name: /Suit Enterprise AI/i });
        expect(dialog.className).toContain('w-[calc(100vw-1rem)]');
        expect(dialog.className).toContain('h-[min(600px,calc(100dvh-6rem))]');
        expect(dialog.className).toContain('safe-area-inset-bottom');
        expect(dialog.className).not.toContain('w-[400px] h-[600px]');

        const input = screen.getByLabelText('Pregunta para el asistente de reportes');
        expect(input.className).toContain('min-h-11');
        expect(input.getAttribute('autofocus')).toBeNull();
        expect(screen.getByRole('button', { name: /Enviar pregunta/i }).className).toContain('min-h-11');
    });
});
