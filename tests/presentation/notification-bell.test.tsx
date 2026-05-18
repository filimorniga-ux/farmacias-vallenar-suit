/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotificationBell from '@/presentation/components/notifications/NotificationBell';

vi.mock('@/presentation/store/useNotificationStore', () => ({
    useNotificationStore: (selector: (state: {
        unreadCount: number;
        toggleOpen: () => void;
        isLoading: boolean;
    }) => unknown) => selector({
        unreadCount: 0,
        toggleOpen: vi.fn(),
        isLoading: false,
    }),
}));

describe('NotificationBell', () => {
    it('usa target táctil mínimo para header móvil', () => {
        render(<NotificationBell />);

        const button = screen.getByRole('button', { name: 'Notificaciones' });
        expect(button.className).toContain('min-h-11');
        expect(button.className).toContain('min-w-11');
    });
});
