/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextSelectionPage from '@/presentation/pages/ContextSelectionPage';

const mocks = vi.hoisted(() => ({
    getPublicLocationsSecure: vi.fn(),
}));

vi.mock('@/actions/public-network-v2', () => ({
    getPublicLocationsSecure: mocks.getPublicLocationsSecure,
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({
            children,
            initial: _initial,
            animate: _animate,
            transition: _transition,
            ...props
        }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
    },
}));

describe('ContextSelectionPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const storage = new Map<string, string>();
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
                removeItem: (key: string) => storage.delete(key),
                clear: () => storage.clear(),
            },
        });
        mocks.getPublicLocationsSecure.mockResolvedValue({
            success: true,
            data: [{
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Farmacia Centro',
                type: 'STORE',
                address: 'Arturo Prat 123',
            }],
        });
    });

    it('expone sucursales como botones táctiles y mantiene contraste del subtítulo', async () => {
        render(<ContextSelectionPage />);

        const subtitle = await screen.findByText('Sistema ERP Clínico Integral');
        const card = await screen.findByRole('button', { name: /Farmacia Centro/i });

        expect(subtitle.className).toContain('text-slate-500');
        expect(card.className).toContain('min-h-44');
        expect(card.className).toContain('focus-visible:ring-2');
    });
});
