/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientsPage from '@/presentation/pages/ClientsPage';
import { Customer } from '@/domain/types';

const mocks = vi.hoisted(() => ({
    fetchCustomersMock: vi.fn(),
    addCustomerMock: vi.fn(),
    updateCustomerMock: vi.fn(),
    deleteCustomerMock: vi.fn(),
    customersState: [] as Customer[],
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        customers: mocks.customersState,
        fetchCustomers: mocks.fetchCustomersMock,
        addCustomer: mocks.addCustomerMock,
        updateCustomer: mocks.updateCustomerMock,
        deleteCustomer: mocks.deleteCustomerMock,
        salesHistory: [],
    }),
}));

vi.mock('@/actions/customer-export-v2', () => ({
    generateCustomerReportSecure: vi.fn(),
    generateCustomerHistoryReportSecure: vi.fn(),
}));

vi.mock('@/actions/customers-v2', () => ({
    getCustomerHistorySecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
    id: 'cust-1',
    rut: '12.345.678-5',
    fullName: 'Ana Cliente Preferente',
    phone: '+56911111111',
    email: 'ana@example.com',
    totalPoints: 120,
    registrationSource: 'POS',
    lastVisit: new Date('2026-04-20T12:00:00.000Z').getTime(),
    total_spent: 45000,
    tags: ['VIP'],
    status: 'ACTIVE',
    name: 'Ana Cliente Preferente',
    age: 40,
    health_tags: [],
    ...overrides,
});

describe('ClientsPage mobile layout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.customersState.length = 0;
    });

    it('usa cards móviles y mantiene la tabla solo para desktop', () => {
        mocks.customersState.push(makeCustomer());

        render(<ClientsPage />);

        expect(screen.getByTestId('clients-mobile-list').className).toContain('md:hidden');
        expect(screen.getByTestId('clients-desktop-table').className).toContain('hidden md:block');
        expect(screen.getAllByRole('button', { name: /Ver historial de Ana Cliente Preferente/i })[0]?.className).toContain('min-h-11');
        expect(screen.getAllByRole('button', { name: /Editar Ana Cliente Preferente/i })[0]?.className).toContain('min-h-11');
        expect(screen.getByPlaceholderText('Buscar por RUT, Nombre o Teléfono...').className).toContain('min-h-11');
    });
});
