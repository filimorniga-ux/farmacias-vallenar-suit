/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WMSBottomTabBar } from '@/presentation/components/wms/WMSBottomTabBar';

describe('WMSBottomTabBar', () => {
    it('mantiene tabs móviles scrolleables y con target táctil estable', () => {
        const onTabChange = vi.fn();

        render(
            <WMSBottomTabBar
                activeTab="despacho"
                onTabChange={onTabChange}
                bottomOffset={0}
            />
        );

        const tablist = screen.getByRole('tablist', { name: 'Navegación WMS' });
        const barShell = tablist.parentElement;
        expect(barShell?.className).toContain('pb-safe');
        expect(tablist.className).toContain('overflow-x-auto');
        expect(tablist.className).toContain('snap-x');
        expect(tablist.className).toContain('touch-pan-x');

        const tabs = screen.getAllByRole('tab');
        expect(tabs.length).toBeGreaterThanOrEqual(8);

        for (const tab of tabs) {
            expect(tab.getAttribute('type')).toBe('button');
            expect(tab.className).toContain('min-w-[4.75rem]');
            expect(tab.className).toContain('min-h-[56px]');
            expect(tab.className).toContain('snap-center');
        }

        const activeTab = screen.getByRole('tab', { name: 'Despacho' });
        expect(activeTab.getAttribute('aria-selected')).toBe('true');

        fireEvent.click(screen.getByRole('tab', { name: 'Recepción' }));
        expect(onTabChange).toHaveBeenCalledWith('recepcion');
    });
});
