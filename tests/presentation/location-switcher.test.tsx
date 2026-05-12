/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LocationSwitcher from '@/presentation/components/layout/LocationSwitcher';

const mocks = vi.hoisted(() => ({
    router: {
        push: vi.fn(),
        refresh: vi.fn(),
    },
    locationState: {
        currentLocation: {
            id: 'loc-1',
            name: 'Farmacia Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
        },
        locations: [{
            id: 'loc-1',
            name: 'Farmacia Centro',
            type: 'STORE',
            default_warehouse_id: 'wh-1',
            is_active: true,
        }],
        switchLocation: vi.fn(),
        canSwitchLocation: vi.fn(() => false),
    },
    pharmaState: {
        user: { role: 'MANAGER' },
        setCurrentLocation: vi.fn(),
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => mocks.router,
}));

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: <T,>(selector: (state: typeof mocks.locationState) => T) => selector(mocks.locationState),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector: (state: typeof mocks.pharmaState) => T) => selector(mocks.pharmaState),
}));

describe('LocationSwitcher', () => {
    it('renderiza fuera de QueryClientProvider y permite variante compacta', () => {
        render(<LocationSwitcher variant="compact" />);

        expect(screen.getByRole('button')).toBeTruthy();
        expect(screen.queryByText('Ubicación Actual')).toBeNull();
    });
});
