import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockRequireReportActor,
    mockRedirect,
} = vi.hoisted(() => ({
    mockRequireReportActor: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/actions/report-scope', async () => {
    return {
        REPORTS_PAGE_ROLES: ['MANAGER', 'ADMIN'],
        PRODUCT_REPORT_ROLES: ['QF', 'ADMIN'],
        requireReportActor: (...args: unknown[]) => mockRequireReportActor(...args),
    };
});

vi.mock('@/app/reports/ReportsClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="reports-client-page" />,
}));

vi.mock('@/app/reports/sales-by-product/ProductSalesReportClientPage', () => ({
    __esModule: true,
    default: () => <div data-testid="product-sales-report-client-page" />,
}));

import ReportsRoutePage from '@/app/reports/page';
import ProductSalesReportRoutePage from '@/app/reports/sales-by-product/page';

describe('/app/reports entrypoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige /reports si el actor no está autorizado', async () => {
        mockRequireReportActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(ReportsRoutePage()).rejects.toThrow('NEXT_REDIRECT');
    });

    it('renderiza /reports con actor válido', async () => {
        mockRequireReportActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        const result = await ReportsRoutePage();

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });

    it('redirige /reports/sales-by-product si el actor no tiene rol de producto', async () => {
        mockRequireReportActor.mockResolvedValue({
            success: false,
            error: 'Acceso denegado',
        });

        await expect(ProductSalesReportRoutePage()).rejects.toThrow('NEXT_REDIRECT');
    });

    it('renderiza /reports/sales-by-product con actor válido', async () => {
        mockRequireReportActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'qf-1',
                role: 'QF',
                locationId: 'loc-1',
                userName: 'QF',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        const result = await ProductSalesReportRoutePage();

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(result).toBeTruthy();
    });
});
