/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
} from '@/lib/operational-message-catalog';
import { SecurityPolicyPanel } from '@/presentation/components/settings/SecurityPolicyPanel';
import { FinancialAccountsSettings } from '@/presentation/components/settings/FinancialAccountsSettings';
import SettingsPage from '@/presentation/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
    getOperationalSettingsSecureMock: vi.fn(),
    getActiveSessionsSecureMock: vi.fn(),
    forceLogoutSecureMock: vi.fn(),
    getFinancialAccountsSecureMock: vi.fn(),
    getOrganizationStructureSecureMock: vi.fn(),
    settingsSearchParams: new URLSearchParams('tab=finances'),
    setSearchParamsMock: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
        <a href={to} {...props}>{children}</a>
    ),
    useSearchParams: () => [mocks.settingsSearchParams, mocks.setSearchParamsMock],
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock('sonner', () => ({
    toast: {
        loading: vi.fn(() => 'toast-id'),
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        user: {
            id: 'current-user',
            role: 'ADMIN',
        },
    }),
}));

vi.mock('@/actions/settings-v2', () => ({
    getOperationalSettingsSecure: mocks.getOperationalSettingsSecureMock,
}));

vi.mock('@/actions/security-v2', () => ({
    getActiveSessionsSecure: mocks.getActiveSessionsSecureMock,
    forceLogoutSecure: mocks.forceLogoutSecureMock,
}));

vi.mock('@/actions/financial-accounts-v2', () => ({
    getFinancialAccountsSecure: mocks.getFinancialAccountsSecureMock,
    createFinancialAccountSecure: vi.fn(),
    updateFinancialAccountSecure: vi.fn(),
    toggleAccountStatusSecure: vi.fn(),
}));

vi.mock('@/actions/network-v2', () => ({
    getOrganizationStructureSecure: mocks.getOrganizationStructureSecureMock,
}));

describe('settings operational vocabulary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getOperationalSettingsSecureMock.mockResolvedValue({
            success: true,
            data: {
                sii_enabled: true,
                fiscal_mode: 'FISCAL',
                sii_environment: 'CERTIFICACION',
                security: {
                    idle_timeout_minutes: 5,
                    max_login_attempts: 5,
                    lockout_duration_minutes: 15,
                },
            },
        });
        mocks.getActiveSessionsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    user_id: 'current-user',
                    name: 'Gerente',
                    role: 'ADMIN',
                    last_active_at: new Date('2026-04-21T12:00:00.000Z'),
                    current_context: {
                        location_id: 'loc-1',
                        ip: '127.0.0.1',
                    },
                    status: 'ONLINE',
                    is_locked: false,
                },
            ],
        });
        mocks.getFinancialAccountsSecureMock.mockResolvedValue({
            success: true,
            data: [],
        });
        mocks.getOrganizationStructureSecureMock.mockResolvedValue({
            success: true,
            data: {
                locations: [
                    { id: 'loc-1', name: 'Sucursal Centro' },
                ],
            },
        });
    });

    it('usa autoridad y origen canónicos en seguridad sin volver a server-side/backend visible', async () => {
        render(<SecurityPolicyPanel />);

        expect(await screen.findByText(OPERATIONAL_CONTEXT_ORIGIN_LABELS.validatedSession)).toBeTruthy();
        expect(screen.getAllByText(new RegExp(OPERATIONAL_AUTHORITY_LABELS.serverSourceOfTruth)).length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText('Ubicación / Contexto')).toBeNull();
        expect(screen.queryByText(/server-side/i)).toBeNull();
        expect(screen.queryByText(/backend/i)).toBeNull();
        expect(screen.getByRole('link', { name: /Abrir Kiosko/i }).getAttribute('href')).toBe('/kiosk');

        await waitFor(() => {
            expect(mocks.getActiveSessionsSecureMock).toHaveBeenCalled();
        });
    });

    it('mantiene cuentas financieras con selección manual visible sin tocar semántica financiera', async () => {
        render(<FinancialAccountsSettings />);

        await waitFor(() => {
            expect(mocks.getOrganizationStructureSecureMock).toHaveBeenCalled();
        });
        fireEvent.click(screen.getByRole('button', { name: /Nueva Cuenta/i }));

        expect(screen.getByText(new RegExp(OPERATIONAL_CONTEXT_ORIGIN_LABELS.manualSelection))).toBeTruthy();
        expect(screen.getByText('Caja Fuerte (Bóveda)')).toBeTruthy();
        expect(screen.queryByText(/principalmente en ese contexto/i)).toBeNull();
    });

    it('usa autoridad canónica en el resumen visible de settings sin reintroducir backend', async () => {
        render(<SettingsPage />);

        expect(await screen.findByText(OPERATIONAL_AUTHORITY_LABELS.serverSourceOfTruth)).toBeTruthy();
        expect(screen.getByText(/Modo Fiscal/i)).toBeTruthy();
        expect(screen.queryByText(/Backend Activo/i)).toBeNull();
        expect(screen.queryByText(/Backend Interno/i)).toBeNull();
        expect(screen.queryByText(/configuración backend/i)).toBeNull();
    });
});
