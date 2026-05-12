import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { redirectMock } = vi.hoisted(() => ({
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}));

vi.mock('@/presentation/pages/ContextSelectionPage', () => ({
    __esModule: true,
    default: () => <div data-testid="context-selection-page" />,
}));

vi.mock('@/app/totem/TotemClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="totem-client-page" />,
}));

vi.mock('@/app/kiosk/KioskClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="kiosk-client-page" />,
}));

import SelectContextRoutePage from '@/app/select-context/page';
import TotemRoutePage from '@/app/totem/page';
import TotemClientPage from '@/app/totem/TotemClientPage';
import TotemSetupRoutePage from '@/app/totem/setup/page';
import QueueRoutePage from '@/app/queue/page';
import KioskRoutePage from '@/app/kiosk/page';
import KioskClientPage from '@/app/kiosk/KioskClientPage';
import KioskSetupRoutePage from '@/app/kiosk/setup/page';
import ContextSelectionPage from '@/presentation/pages/ContextSelectionPage';

describe('public kiosk App Router routes', () => {
    it('renderiza selección de contexto como ruta pública explícita', () => {
        const page = SelectContextRoutePage();

        expect((page as ReactElement).type).toBe(ContextSelectionPage);
    });

    it('renderiza totem de fila sin depender del router legacy', () => {
        const page = TotemRoutePage();

        expect((page as ReactElement).type).toBe(TotemClientPage);
    });

    it('renderiza kiosko de asistencia sin depender del router legacy', () => {
        const page = KioskRoutePage();

        expect((page as ReactElement).type).toBe(KioskClientPage);
    });

    it('mantiene aliases públicos hacia rutas canónicas', () => {
        expect(() => QueueRoutePage()).toThrow('REDIRECT:/totem');
        expect(() => TotemSetupRoutePage()).toThrow('REDIRECT:/totem');
        expect(() => KioskSetupRoutePage()).toThrow('REDIRECT:/kiosk');
        expect(redirectMock).toHaveBeenCalledWith('/totem');
        expect(redirectMock).toHaveBeenCalledWith('/kiosk');
    });
});
