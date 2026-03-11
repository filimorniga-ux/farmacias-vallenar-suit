/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SuppliersPage } from '@/presentation/pages/SuppliersPage';
import { Supplier } from '@/domain/types';

const mocks = vi.hoisted(() => {
    const addSupplierMock = vi.fn();
    const updateSupplierMock = vi.fn();
    const suppliersState: Supplier[] = [];

    return {
        suppliersState,
        addSupplierMock,
        updateSupplierMock,
        toastSuccessMock: vi.fn(),
        toastErrorMock: vi.fn(),
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        suppliers: mocks.suppliersState,
        addSupplier: mocks.addSupplierMock,
        updateSupplier: mocks.updateSupplierMock,
    }),
}));

vi.mock('@/actions/supplier-export-v2', () => ({
    generateSupplierReportSecure: vi.fn(),
}));

vi.mock('@/presentation/components/suppliers/AddSupplierModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/common/AdvancedExportModal', () => ({
    AdvancedExportModal: () => null,
}));

vi.mock('sonner', () => ({
    toast: {
        success: mocks.toastSuccessMock,
        error: mocks.toastErrorMock,
    },
}));

const makeSupplier = (overrides: Partial<Supplier>): Supplier => ({
    id: 'sup-1',
    rut: '76.123.456-7',
    business_name: 'Distribuidora Andes SpA',
    fantasy_name: 'Andes Pharma',
    address: 'Av. Siempre Viva 123',
    region: 'RM',
    city: 'Santiago',
    commune: 'Santiago Centro',
    phone_1: '+56911111111',
    contact_email: 'contacto@andes.cl',
    email_orders: 'oc@andes.cl',
    email_billing: 'facturas@andes.cl',
    contacts: [],
    sector: 'Distribuidora',
    brands: ['Marca A'],
    categories: ['MEDICAMENTOS'],
    payment_terms: '30_DIAS',
    rating: 4,
    lead_time_days: 3,
    ...overrides,
});

describe('SuppliersPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.suppliersState.length = 0;
    });

    it('mantiene configuración compacta para móvil y CTA corto en cards', () => {
        mocks.suppliersState.push(makeSupplier({}));

        render(
            <MemoryRouter>
                <SuppliersPage />
            </MemoryRouter>
        );

        const title = screen.getByRole('heading', { name: 'Proveedores' });
        expect(title.className).toContain('text-lg');
        expect(title.className).toContain('md:text-2xl');

        const exportLabel = screen.getByText('Exportar Excel');
        expect(exportLabel.className).toContain('hidden');
        expect(exportLabel.className).toContain('md:inline');

        const newSupplierLabel = screen.getByText('Nuevo Proveedor');
        expect(newSupplierLabel.className).toContain('hidden');
        expect(newSupplierLabel.className).toContain('md:inline');

        expect(screen.queryByText('Ver Perfil')).toBeNull();
        expect(screen.getByText('Ver')).toBeTruthy();
    });

    it('filtra correctamente por categoría desde chips', () => {
        mocks.suppliersState.push(
            makeSupplier({
                id: 'sup-med',
                fantasy_name: 'Farmalab',
                business_name: 'Farmalab Ltda',
                categories: ['MEDICAMENTOS'],
            }),
            makeSupplier({
                id: 'sup-ins',
                fantasy_name: 'Insumed',
                business_name: 'Insumed Spa',
                categories: ['INSUMOS'],
            }),
        );

        render(
            <MemoryRouter>
                <SuppliersPage />
            </MemoryRouter>
        );

        expect(screen.getByText('Farmalab')).toBeTruthy();
        expect(screen.getByText('Insumed')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'INSUMOS' }));

        expect(screen.queryByText('Farmalab')).toBeNull();
        expect(screen.getByText('Insumed')).toBeTruthy();
    });
});
