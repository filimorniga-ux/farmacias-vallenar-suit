import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const mocks = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mocks.redirectMock(path),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: mocks.getValidatedSessionMock,
}));

vi.mock('@/app/settings/SettingsClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="settings-client-page" />,
}));

vi.mock('@/app/settings/printing/PrintingSettingsClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="printing-settings-client-page" />,
}));

import SettingsRoutePage from '@/app/settings/page';
import SettingsAiRoutePage from '@/app/settings/ai/page';
import SettingsPrintingRoutePage from '@/app/settings/printing/page';
import SettingsClientPage from '@/app/settings/SettingsClientPage';
import PrintingSettingsClientPage from '@/app/settings/printing/PrintingSettingsClientPage';

describe('/app/settings/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige a login si no hay sesión validada', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(SettingsRoutePage()).rejects.toThrow('NEXT_REDIRECT:/login');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
    });

    it('redirige al inicio si el rol no tiene acceso a configuración', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        await expect(SettingsRoutePage()).rejects.toThrow('NEXT_REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('renderiza configuración para roles gerenciales', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'manager-1',
            role: 'manager',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 2,
            sessionToken: 'token',
        });

        const page = await SettingsRoutePage();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
        expect((page as ReactElement).type).toBe(SettingsClientPage);
    });
});

describe('/app/settings/ai/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige al tab de IA dentro de configuración madura', () => {
        expect(() => SettingsAiRoutePage()).toThrow('NEXT_REDIRECT:/settings?tab=ai');
        expect(mocks.redirectMock).toHaveBeenCalledWith('/settings?tab=ai');
    });
});

describe('/app/settings/printing/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige a login si no hay sesión validada', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(SettingsPrintingRoutePage()).rejects.toThrow('NEXT_REDIRECT:/login');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
    });

    it('redirige al inicio si el rol no puede administrar impresión', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        await expect(SettingsPrintingRoutePage()).rejects.toThrow('NEXT_REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('renderiza el diseñador de impresión para roles gerenciales', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 2,
            sessionToken: 'token',
        });

        const page = await SettingsPrintingRoutePage();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
        expect((page as ReactElement).type).toBe(PrintingSettingsClientPage);
    });
});
