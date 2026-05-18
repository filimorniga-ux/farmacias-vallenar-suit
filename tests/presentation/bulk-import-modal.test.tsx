/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BulkImportModal from '@/presentation/components/inventory/BulkImportModal';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('react-dropzone', () => ({
    useDropzone: () => ({
        getRootProps: () => ({ role: 'button', tabIndex: 0 }),
        getInputProps: () => ({ type: 'file' }),
        isDragActive: false,
    }),
}));

function renderBulkImportModal() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <BulkImportModal isOpen onClose={vi.fn()} />
        </QueryClientProvider>
    );
}

describe('BulkImportModal', () => {
    it('muestra formato histórico sin lenguaje Legacy visible ni cambiar el flujo de selección', () => {
        renderBulkImportModal();

        expect(screen.getByText('Carga de inventario desde Excel con plantilla oficial o formatos históricos')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Formato histórico/i })).toBeTruthy();
        expect(screen.queryByText(/Legacy/i)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Formato histórico/i }));

        expect(screen.getByText('Importador de formatos históricos')).toBeTruthy();
        expect(screen.getByText(/Formatos antiguos o variables/i)).toBeTruthy();
        expect(screen.queryByText(/Legacy/i)).toBeNull();
    });
});
