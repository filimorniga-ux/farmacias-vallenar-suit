/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InventoryPage from '@/presentation/pages/InventoryPage';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
        user: { id: 'user-1', role: 'ADMIN', name: 'Admin Test' },
        inventory: [],
        suppliers: [],
        updateStock: vi.fn(),
        addNewProduct: vi.fn(),
        setInventory: vi.fn(),
        setCurrentLocation: vi.fn(),
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
        }
    );

    const locationState = {
        locations: [{ id: 'loc-1', name: 'Sucursal Test', default_warehouse_id: 'wh-1', is_active: true }],
    };

    return {
        inventoryPageData: [] as Array<Record<string, unknown>>,
        usePharmaStoreMock,
        locationState,
    };
});

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count }: { count: number }) => ({
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
            key: index,
            index,
            start: index * 180,
            size: 180,
            end: (index + 1) * 180,
            lane: 0,
        })),
        getTotalSize: () => count * 180,
        measure: vi.fn(),
        measureElement: vi.fn(),
    }),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector?: (state: typeof mocks.locationState) => unknown) =>
        selector ? selector(mocks.locationState) : mocks.locationState,
}));

vi.mock('@/presentation/hooks/useInventoryPagedQuery', () => ({
    useInventoryPagedQuery: () => ({
        data: { pages: [{ data: mocks.inventoryPageData, meta: { total: mocks.inventoryPageData.length, page: 1, totalPages: 1 } }] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
    }),
}));

vi.mock('@/presentation/hooks/useBarcodeScanner', () => ({
    useBarcodeScanner: () => undefined,
}));

vi.mock('@/presentation/components/inventory/StockEntryModal', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/StockTransferModal', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/ProductFormModal', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/BulkImportModal', () => ({
    default: () => <div data-testid="bulk-import-modal">bulk import</div>,
}));

vi.mock('@/presentation/components/inventory/InventoryExportModal', () => ({
    default: () => <div data-testid="inventory-export-modal">inventory export</div>,
}));

vi.mock('@/presentation/components/inventory/QuickStockModal', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/ProductDeleteConfirm', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/PriceAdjustmentModal', () => ({
    default: () => null,
}));

vi.mock('@/presentation/components/inventory/WebPriceResearchPanel', () => ({
    default: () => null,
}));

vi.mock('@/actions/inventory-diagnostics-v2', () => ({
    findDuplicateBatchesSecure: vi.fn(),
    findDuplicateBarcodesSecure: vi.fn(),
}));

vi.mock('@/presentation/components/inventory/InventoryCostEditor', () => ({
    InventoryCostEditor: () => null,
}));

vi.mock('@/presentation/components/ui/MobileActionScroll', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/presentation/components/skeletons/InventorySkeleton', () => ({
    __esModule: true,
    default: () => <div>loading</div>,
}));

vi.mock('@/components/shared/MobileScanner', () => ({
    MobileScanner: () => <div data-testid="mobile-scanner">scanner</div>,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('InventoryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
        mocks.inventoryPageData = [];
    });

    it('carga el scanner móvil solo cuando el usuario abre el flujo explícito', async () => {
        render(<InventoryPage />);

        expect(screen.queryByTestId('mobile-scanner')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /abrir scanner de inventario/i }));

        expect(await screen.findByTestId('mobile-scanner')).not.toBeNull();
    });

    it('carga el modal de importación solo al abrirlo explícitamente', async () => {
        render(<InventoryPage />);

        expect(screen.queryByTestId('bulk-import-modal')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /importar excel/i }));

        expect(await screen.findByTestId('bulk-import-modal')).not.toBeNull();
    });

    it('carga el modal de exportación solo al abrirlo explícitamente', async () => {
        render(<InventoryPage />);

        expect(screen.queryByTestId('inventory-export-modal')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /exportar kardex/i }));

        expect(await screen.findByTestId('inventory-export-modal')).not.toBeNull();
    });

    it('abre el diagnóstico read-only de calidad de inventario bajo acción explícita', async () => {
        render(<InventoryPage />);

        expect(screen.queryByRole('heading', { name: /diagnóstico de calidad de inventario/i })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /^diagnóstico$/i }));

        expect(await screen.findByRole('heading', { name: /diagnóstico de calidad de inventario/i })).toBeTruthy();
        expect(screen.getByText(/esta vista no modifica datos/i)).toBeTruthy();
    });

    it('no replica el inventario paginado al store como fuente de verdad operativa', () => {
        render(<InventoryPage />);

        expect(mocks.usePharmaStoreMock.getState().setInventory).not.toHaveBeenCalled();
    });

    it('distingue mínimo configurado y ausente sin inventar un stock_min visual', () => {
        mocks.inventoryPageData = [
            {
                id: 'prod-no-min',
                name: 'Producto sin mínimo',
                sku: 'SKU-NOMIN',
                laboratory: 'Laboratorio Test',
                stock_actual: 3,
                stock_min: null,
                price: 1290,
                batches: [],
            },
            {
                id: 'prod-zero-min',
                name: 'Producto con mínimo cero',
                sku: 'SKU-ZERO',
                laboratory: 'Laboratorio Test',
                stock_actual: 6,
                stock_min: 0,
                price: 990,
                batches: [],
            },
        ];

        render(<InventoryPage />);

        expect(screen.getByText('Producto sin mínimo')).toBeTruthy();
        expect(screen.getByText('Mínimo no configurado')).toBeTruthy();
        expect(screen.getByText('Producto con mínimo cero')).toBeTruthy();
        expect(screen.getByText('Mínimo: 0')).toBeTruthy();
        expect(screen.queryByText('Mínimo: 5')).toBeNull();

        const stockWithoutMinimum = screen.getByText('3');
        expect(stockWithoutMinimum.className).toContain('text-slate-800');
        expect(stockWithoutMinimum.className).not.toContain('text-red-600');
    });
});
