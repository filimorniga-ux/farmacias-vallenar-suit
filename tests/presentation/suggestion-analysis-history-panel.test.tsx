/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuggestionAnalysisHistoryPanel from '@/presentation/components/supply/SuggestionAnalysisHistoryPanel';
import { getSuggestionAnalysisHistorySecure } from '@/actions/procurement-v2';
import { exportSuggestedOrdersSecure } from '@/actions/procurement-export';

vi.mock('@/actions/procurement-v2', () => ({
    getSuggestionAnalysisHistorySecure: vi.fn(),
}));

vi.mock('@/actions/procurement-export', () => ({
    exportSuggestedOrdersSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const mockGetSuggestionAnalysisHistorySecure = vi.mocked(getSuggestionAnalysisHistorySecure);
const mockExportSuggestedOrdersSecure = vi.mocked(exportSuggestedOrdersSecure);

const baseHistory = [
    {
        history_id: 'hist-12345678',
        executed_at: '2026-02-18T12:00:00.000Z',
        executed_by: 'Manager',
        location_id: 'loc-1',
        location_name: 'Sucursal Centro',
        supplier_id: 'sup-1',
        supplier_name: 'Proveedor Uno',
        days_to_cover: 15,
        analysis_window: 30,
        stock_threshold: 0.2,
        search_query: 'Paracetamol',
        limit: 100,
        total_results: 42,
        critical_count: 6,
        transfer_count: 8,
        total_estimated: 50000,
    },
];

describe('SuggestionAnalysisHistoryPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('carga y muestra historial reciente del motor', async () => {
        mockGetSuggestionAnalysisHistorySecure.mockResolvedValue({
            success: true,
            data: baseHistory,
        });

        render(<SuggestionAnalysisHistoryPanel locationId="loc-1" isActive refreshKey={0} />);

        await waitFor(() => {
            expect(mockGetSuggestionAnalysisHistorySecure).toHaveBeenCalledWith({ locationId: 'loc-1', limit: 30 });
        });

        expect(await screen.findByText('Historial Reciente')).toBeTruthy();
        expect(screen.getByText('Analisis masivo')).toBeTruthy();
        expect(screen.getByText('42 items')).toBeTruthy();
    });

    it('exporta desde detalle usando filtros guardados de historial', async () => {
        mockGetSuggestionAnalysisHistorySecure.mockResolvedValue({
            success: true,
            data: baseHistory,
        });
        mockExportSuggestedOrdersSecure.mockResolvedValue({
            success: false,
            error: 'mock export',
        });

        render(<SuggestionAnalysisHistoryPanel locationId="loc-1" isActive refreshKey={0} />);

        const card = await screen.findByText('Analisis masivo');
        fireEvent.click(card);
        fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

        await waitFor(() => {
            expect(mockExportSuggestedOrdersSecure).toHaveBeenCalledWith({
                supplierId: 'sup-1',
                daysToCover: 15,
                analysisWindow: 30,
                locationId: 'loc-1',
                stockThreshold: 0.2,
                searchQuery: 'Paracetamol',
                limit: 100,
            });
        });
    });
});
