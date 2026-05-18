/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/presentation/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
    role: { current: 'ADMIN' },
    searchParams: { current: new URLSearchParams('tab=general') },
    setSearchParams: vi.fn(),
    getOperationalSettingsSecure: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
        <a href={to} {...props}>{children}</a>
    ),
    useSearchParams: () => [mocks.searchParams.current, mocks.setSearchParams],
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        user: { id: 'user-1', role: mocks.role.current },
    }),
}));

vi.mock('@/actions/settings-v2', () => ({
    getOperationalSettingsSecure: mocks.getOperationalSettingsSecure,
}));

vi.mock('@/presentation/pages/settings/SiiSettings', () => ({ default: () => <div>SII Panel</div> }));
vi.mock('@/presentation/pages/settings/HardwarePage', () => ({ default: () => <div>Hardware Panel</div> }));
vi.mock('@/presentation/pages/settings/InventorySettings', () => ({ default: () => <div>Inventory Panel</div> }));
vi.mock('@/presentation/pages/settings/LoyaltySettings', () => ({ default: () => <div>Loyalty Panel</div> }));
vi.mock('@/presentation/components/settings/InfrastructureBillingPanel', () => ({ default: () => <div>Billing Panel</div> }));
vi.mock('@/presentation/components/settings/UsersList', () => ({
    UsersList: () => <div>Users List</div>,
}));
vi.mock('@/presentation/components/settings/UsersSettingsForm', () => ({
    UsersSettingsForm: () => <div>Users Form</div>,
}));
vi.mock('@/presentation/components/settings/TerminalSettings', () => ({
    TerminalSettings: () => <div>Terminal Panel</div>,
}));
vi.mock('@/presentation/components/settings/GeneralSettings', () => ({
    GeneralSettings: () => <div>General Panel</div>,
}));
vi.mock('@/presentation/components/settings/AuditLogTable', () => ({
    AuditLogTable: () => <div>Audit Log Panel</div>,
}));
vi.mock('@/presentation/components/settings/SecurityPolicyPanel', () => ({
    SecurityPolicyPanel: () => <div>Security Panel</div>,
}));
vi.mock('@/presentation/components/settings/FinancialAccountsSettings', () => ({
    FinancialAccountsSettings: () => <div>Financial Accounts Panel</div>,
}));

describe('SettingsPage mobile/RBAC visible', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.role.current = 'ADMIN';
        mocks.searchParams.current = new URLSearchParams('tab=general');
        mocks.getOperationalSettingsSecure.mockResolvedValue({
            success: true,
            data: {
                sii_enabled: true,
                fiscal_mode: 'FISCAL',
                sii_environment: 'CERTIFICACION',
            },
        });
    });

    it('ofrece selector móvil de secciones con tamaño táctil mínimo', async () => {
        render(<SettingsPage />);

        const selector = screen.getByRole('combobox', { name: /Sección de configuración/i });
        expect(selector.className).toContain('min-h-11');
        expect(screen.getByRole('option', { name: 'General' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Mantenimiento' })).toBeTruthy();
        await waitFor(() => {
            expect(mocks.getOperationalSettingsSecure).toHaveBeenCalled();
        });
    });

    it('normaliza tabs no permitidos para que no monten paneles ocultos por rol', async () => {
        mocks.role.current = 'QF';
        mocks.searchParams.current = new URLSearchParams('tab=ai');

        render(<SettingsPage />);

        expect(screen.getByText('General Panel')).toBeTruthy();
        expect(screen.queryByText('Inteligencia Artificial')).toBeNull();
        expect(screen.queryByText(/Configuración de Inteligencia Artificial/i)).toBeNull();
        await waitFor(() => {
            expect(mocks.getOperationalSettingsSecure).toHaveBeenCalled();
        });
    });

    it('mantiene botón y contenido alineados para GERENTE_GENERAL en paneles administrativos', async () => {
        mocks.role.current = 'GERENTE_GENERAL';
        mocks.searchParams.current = new URLSearchParams('tab=finances');

        render(<SettingsPage />);

        expect(screen.getByRole('option', { name: 'Finanzas' })).toBeTruthy();
        expect(screen.getByText('Financial Accounts Panel')).toBeTruthy();
        await waitFor(() => {
            expect(mocks.getOperationalSettingsSecure).toHaveBeenCalled();
        });
    });
});
