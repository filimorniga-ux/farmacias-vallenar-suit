/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceListPage from '@/app/procurement/smart-invoice/list/page';
import { getPendingParsingsSecure, getSmartInvoiceLocationsSecure } from '@/actions/invoice-parser-v2';

const mocks = vi.hoisted(() => ({
    getPendingParsingsSecureMock: vi.fn(),
    getSmartInvoiceLocationsSecureMock: vi.fn(),
    usePharmaStoreState: {
        user: {
            id: 'user-1',
            role: 'MANAGER',
            name: 'Manager Test',
        },
    },
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock('@/actions/invoice-parser-v2', () => ({
    getPendingParsingsSecure: mocks.getPendingParsingsSecureMock,
    getSmartInvoiceLocationsSecure: mocks.getSmartInvoiceLocationsSecureMock,
    approveInvoiceParsingSecure: vi.fn(),
    rejectInvoiceParsingSecure: vi.fn(),
    getInvoiceParsingSecure: vi.fn(),
    deleteInvoiceParsingSecure: vi.fn(),
}));

vi.mock('@/actions/products-v2', () => ({
    getProductByIdSecure: vi.fn(),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector: (state: typeof mocks.usePharmaStoreState) => T) =>
        selector(mocks.usePharmaStoreState),
}));

vi.mock('@/components/invoice', () => ({
    InvoiceStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
    AIConfidenceIndicator: ({ score }: { score: number }) => <span>{score}</span>,
}));

vi.mock('@/presentation/components/inventory/ProductFormModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('sonner', () => ({
    toast: {
        loading: vi.fn(() => 'toast-id'),
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('/app/procurement/smart-invoice/list/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getSmartInvoiceLocationsSecureMock.mockResolvedValue({
            success: true,
            data: [{ id: 'loc-1', name: 'Sucursal Centro' }],
        });
        mocks.getPendingParsingsSecureMock.mockResolvedValue({
            success: true,
            data: [],
            totalCount: 0,
        });
    });

    it('renderiza navegación App Router hacia smart-invoice sin cambiar destino ni cargar procesamiento', async () => {
        render(<InvoiceListPage />);

        expect(await screen.findByText('No hay facturas que mostrar')).toBeTruthy();

        const linksToSmartInvoice = screen
            .getAllByRole('link')
            .filter((link) => link.getAttribute('href') === '/procurement/smart-invoice');

        expect(linksToSmartInvoice.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByRole('link', { name: /Nueva Factura/i }).getAttribute('href')).toBe('/procurement/smart-invoice');
        expect(screen.getByRole('link', { name: /Procesar primera factura/i }).getAttribute('href')).toBe('/procurement/smart-invoice');

        await waitFor(() => {
            expect(getPendingParsingsSecure).toHaveBeenCalledWith(expect.objectContaining({
                page: 1,
                pageSize: 20,
            }));
        });
        expect(getSmartInvoiceLocationsSecure).toHaveBeenCalledTimes(1);
    });
});
