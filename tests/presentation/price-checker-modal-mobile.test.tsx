/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import PriceCheckerModal from '@/presentation/components/public/PriceCheckerModal';

const mocks = vi.hoisted(() => ({
    searchProductsAction: vi.fn(async () => []),
    browseProductsAction: vi.fn(async () => []),
    searchBioequivalentsAction: vi.fn(async () => [
        {
            registry_number: 'BE-001',
            product_name: 'Paracetamol 500 mg',
            active_ingredient: 'PARACETAMOL',
            holder: 'Laboratorio Test',
            status: 'Vigente',
            validity: '2026',
            usage: 'Dolor y fiebre',
        },
    ]),
    findInventoryMatchesAction: vi.fn(async () => []),
    getUniqueActiveIngredientsAction: vi.fn(async () => ['PARACETAMOL']),
    getAlternativesAction: vi.fn(async () => []),
    matchActiveIngredientAction: vi.fn(async () => []),
}));

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({ isMobile: true, isNative: false }),
}));

vi.mock('@/actions/public/search-products', () => ({
    searchProductsAction: mocks.searchProductsAction,
}));

vi.mock('@/actions/public/browse-products', () => ({
    browseProductsAction: mocks.browseProductsAction,
}));

vi.mock('@/actions/public/bioequivalents', () => ({
    searchBioequivalentsAction: mocks.searchBioequivalentsAction,
    findInventoryMatchesAction: mocks.findInventoryMatchesAction,
    getUniqueActiveIngredientsAction: mocks.getUniqueActiveIngredientsAction,
}));

vi.mock('@/actions/public/get-alternatives', () => ({
    getAlternativesAction: mocks.getAlternativesAction,
}));

vi.mock('@/actions/public/match-active-ingredient', () => ({
    matchActiveIngredientAction: mocks.matchActiveIngredientAction,
}));

vi.mock('@/presentation/components/ui/CameraScanner', () => ({
    CameraScanner: ({ onClose }: { onClose: () => void }) => (
        <button type="button" onClick={onClose}>Cerrar scanner</button>
    ),
}));

vi.mock('@/presentation/components/public/LegalModal', () => ({
    LegalModal: ({ isOpen }: { isOpen: boolean }) => (
        isOpen ? <div>Legal</div> : null
    ),
}));

describe('PriceCheckerModal mobile UX', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mantiene salida y navegación con nombres accesibles y tamaño táctil móvil', () => {
        const onClose = vi.fn();
        render(<PriceCheckerModal isOpen onClose={onClose} />);

        const closeButton = screen.getByRole('button', { name: 'Salir del consultor de precios' });
        expect(closeButton.className).toContain('min-h-11');
        expect(closeButton.className).toContain('min-w-11');

        fireEvent.click(screen.getByRole('button', { name: /Buscar por Producto/i }));

        const backButton = screen.getByRole('button', { name: 'Volver al inicio del consultor' });
        expect(backButton.className).toContain('min-h-11');
        expect(backButton.className).toContain('min-w-11');
        expect(screen.getByRole('button', { name: 'Escanear código de barras' })).toBeTruthy();

        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('no renderiza marcas técnicas residuales al listar bioequivalentes', async () => {
        render(<PriceCheckerModal isOpen onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Sello Bioequivalente Oficial/i }));

        expect(await screen.findByText('BE-001')).toBeTruthy();
        expect(screen.queryByText('```')).toBeNull();
    });
});
