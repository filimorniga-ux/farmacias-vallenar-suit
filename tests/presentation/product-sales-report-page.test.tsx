/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductSalesReportPage } from '@/presentation/pages/reports/ProductSalesReportPage';

const mocks = vi.hoisted(() => {
    const navigateMock = vi.fn();
    const fetchLocationsMock = vi.fn().mockResolvedValue(undefined);
    const getReportMock = vi.fn().mockResolvedValue({
        success: true,
        data: {
            rows: [],
            summary: { totalUnits: 0, totalAmount: 0, transactionCount: 0 },
        },
    });

    const locationState = {
        locations: [
            { id: 'loc-active', name: 'Farmacia Activa', is_active: true, terminals: [] },
            { id: 'loc-inactive', name: 'Farmacia Eliminada', is_active: false, terminals: [] },
            { id: 'loc-legacy', name: 'Farmacia Legacy', terminals: [] },
        ],
    };

    return {
        navigateMock,
        fetchLocationsMock,
        getReportMock,
        locationState,
    };
});

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocks.navigateMock,
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        employees: [],
    }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: () => ({
        locations: mocks.locationState.locations,
        fetchLocations: mocks.fetchLocationsMock,
    }),
}));

vi.mock('@/actions/reports-v2', () => ({
    getProductSalesReportSecure: mocks.getReportMock,
}));

vi.mock('@/actions/reports-export-v2', () => ({
    exportProductSalesSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('ProductSalesReportPage - filtro de sucursales', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('solo lista sucursales activas cuando hay flag is_active', async () => {
        render(<ProductSalesReportPage />);

        expect(screen.queryByRole('option', { name: 'Farmacia Activa' })).not.toBeNull();
        expect(screen.queryByRole('option', { name: 'Farmacia Eliminada' })).toBeNull();
        expect(screen.queryByRole('option', { name: 'Farmacia Legacy' })).toBeNull();
    });

    it('fuerza sincronización de sucursales al montar la página', async () => {
        render(<ProductSalesReportPage />);

        await waitFor(() => {
            expect(mocks.fetchLocationsMock).toHaveBeenCalledWith(true);
        });
    });
});
