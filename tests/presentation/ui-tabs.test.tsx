/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';

function renderTabs() {
    render(
        <Tabs defaultValue="list">
            <TabsList aria-label="Vistas de atención">
                <TabsTrigger value="list">Lista</TabsTrigger>
                <TabsTrigger value="code">Código</TabsTrigger>
                <TabsTrigger value="history" disabled>Historial</TabsTrigger>
            </TabsList>
            <TabsContent value="list">Contenido lista</TabsContent>
            <TabsContent value="code">Contenido código</TabsContent>
            <TabsContent value="history">Contenido historial</TabsContent>
        </Tabs>
    );
}

describe('presentation ui tabs', () => {
    it('expone semántica tablist/tab/tabpanel', () => {
        renderTabs();

        const tablist = screen.getByRole('tablist', { name: 'Vistas de atención' });
        const listTab = screen.getByRole('tab', { name: 'Lista' });
        const panel = screen.getByRole('tabpanel');

        expect(tablist.className).toContain('min-h-11');
        expect(tablist.className).toContain('h-auto');
        expect(listTab.className).toContain('min-h-9');
        expect(tablist).toBeTruthy();
        expect(listTab.getAttribute('aria-selected')).toBe('true');
        expect(listTab.getAttribute('aria-controls')).toBe(panel.id);
        expect(panel.getAttribute('aria-labelledby')).toBe(listTab.id);
        expect(panel.textContent).toBe('Contenido lista');
    });

    it('permite cambiar de tab con teclado y omite tabs deshabilitados', () => {
        renderTabs();

        const tablist = screen.getByRole('tablist');
        const listTab = screen.getByRole('tab', { name: 'Lista' });
        const codeTab = screen.getByRole('tab', { name: 'Código' });

        listTab.focus();
        fireEvent.keyDown(tablist, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(codeTab);
        expect(codeTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tabpanel').textContent).toBe('Contenido código');

        fireEvent.keyDown(tablist, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(listTab);
        expect(listTab.getAttribute('aria-selected')).toBe('true');
    });
});
