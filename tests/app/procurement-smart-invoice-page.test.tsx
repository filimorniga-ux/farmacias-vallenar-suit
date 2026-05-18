/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SmartInvoicePage from '@/app/procurement/smart-invoice/page';
import { getSmartInvoiceLocationsSecure } from '@/actions/invoice-parser-v2';

const mocks = vi.hoisted(() => ({
    getSmartInvoiceLocationsSecureMock: vi.fn(),
    usePharmaStoreState: {
        currentLocationId: 'loc-store-1',
        user: {
            id: 'user-1',
            role: 'MANAGER',
            name: 'Manager Test',
        },
    },
}));

vi.mock('@/actions/invoice-parser-v2', () => ({
    getSmartInvoiceLocationsSecure: mocks.getSmartInvoiceLocationsSecureMock,
    parseInvoiceDocumentSecure: vi.fn(),
    approveInvoiceParsingSecure: vi.fn(),
    rejectInvoiceParsingSecure: vi.fn(),
    getInvoiceParsingSecure: vi.fn(),
}));

vi.mock('@/actions/config-v2', () => ({
    checkAIConfiguredSecure: vi.fn(),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector: (state: typeof mocks.usePharmaStoreState) => T) =>
        selector(mocks.usePharmaStoreState),
}));

vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/invoice', () => ({
    InvoiceUploader: () => <div data-testid="invoice-uploader" />,
    InvoiceViewer: () => <div data-testid="invoice-viewer" />,
    InvoiceValidationForm: () => <div data-testid="invoice-validation-form" />,
    InvoiceItemsList: () => <div data-testid="invoice-items-list" />,
    ProductMappingDialog: () => null,
}));

vi.mock('@/app/procurement/smart-invoice/ConfirmAutoCreateModal', () => ({
    ConfirmAutoCreateModal: () => null,
}));

vi.mock('@/presentation/components/inventory/ProductFormModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('sonner', () => ({
    toast: {
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(),
    },
}));

describe('/app/procurement/smart-invoice/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getSmartInvoiceLocationsSecureMock.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'loc-store-1',
                    name: 'Sucursal Centro',
                },
            ],
        });
    });

    it('usa el lookup scopeado del feature para cargar ubicaciones mínimas', async () => {
        render(<SmartInvoicePage />);

        expect(screen.getByTestId('invoice-uploader')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Historial/i }).getAttribute('href')).toBe('/procurement/smart-invoice/list');
        expect(screen.getByRole('link', { name: /Configurar IA/i }).getAttribute('href')).toBe('/settings?tab=ai');

        await waitFor(() => {
            expect(getSmartInvoiceLocationsSecure).toHaveBeenCalledTimes(1);
        });
    });
});
