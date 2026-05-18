/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SmartOrderPage from '@/app/procurement/smart-order/page';
import { OPERATIONAL_QUICK_ACTION_UX_EVENT } from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
} from '@/lib/operational-message-catalog';
import {
    approvePurchaseOrderSecure,
    createPurchaseOrderSecure,
    generateRestockSuggestionSecure,
    getSmartOrderLowStockPrefillSecure,
} from '@/actions/procurement-v2';

const mocks = vi.hoisted(() => {
    const pharmaState = {
        user: {
            id: '550e8400-e29b-41d4-a716-446655440999',
            assigned_location_id: 'loc-1',
        },
        currentLocationId: 'loc-1',
        currentWarehouseId: 'wh-1',
    };
    const locationState = {
        currentLocation: {
            id: 'loc-1',
            name: 'Sucursal Centro',
            default_warehouse_id: 'wh-1',
        },
        locations: [
            { id: 'loc-1', name: 'Sucursal Centro', default_warehouse_id: 'wh-1' },
            { id: 'loc-2', name: 'Sucursal Norte', default_warehouse_id: 'wh-2' },
            { id: 'wh-2', name: 'Bodega Norte', type: 'WAREHOUSE' },
        ],
    };

    return {
        pharmaState,
        locationState,
        searchParams: new URLSearchParams(),
        generateRestockSuggestionSecureMock: vi.fn(),
        getSmartOrderLowStockPrefillSecureMock: vi.fn(),
        createPurchaseOrderSecureMock: vi.fn(),
        approvePurchaseOrderSecureMock: vi.fn(),
    };
});

vi.mock('next/navigation', () => ({
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: vi.fn(),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: <T,>(selector?: (state: typeof mocks.pharmaState) => T) =>
        selector ? selector(mocks.pharmaState) : (mocks.pharmaState as T),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: <T,>(selector: (state: typeof mocks.locationState) => T) => selector(mocks.locationState),
}));

vi.mock('@/presentation/hooks/useBootstrapSupplyProcurement', () => ({
    useBootstrapSupplyProcurement: () => ({
        suppliers: [{ id: 'sup-1', name: 'Proveedor Test' }],
    }),
}));

vi.mock('@/components/shared/PinModal', () => ({
    PinModal: () => null,
}));

vi.mock('@/actions/procurement-v2', () => ({
    generateRestockSuggestionSecure: mocks.generateRestockSuggestionSecureMock,
    getSmartOrderLowStockPrefillSecure: mocks.getSmartOrderLowStockPrefillSecureMock,
    createPurchaseOrderSecure: mocks.createPurchaseOrderSecureMock,
    approvePurchaseOrderSecure: mocks.approvePurchaseOrderSecureMock,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('SmartOrderPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.searchParams = new URLSearchParams();

        vi.mocked(generateRestockSuggestionSecure).mockResolvedValue({
            success: true,
            data: [
                {
                    product_id: 'prod-1',
                    product_name: 'Producto Test',
                    sku: 'SKU-001',
                    unit_cost: 1200,
                    suggested_quantity: 4,
                    current_stock: 2,
                    daily_velocity: 1,
                },
            ],
        } as any);
        vi.mocked(getSmartOrderLowStockPrefillSecure).mockResolvedValue({
            success: true,
            data: {
                source: 'inventory-critical-low-stock',
                locationId: 'loc-2',
                locationName: 'Sucursal Norte',
                warehouseId: 'wh-2',
                warehouseName: 'Bodega Norte',
                generatedAt: '2026-04-21T12:00:00.000Z',
                providerSelection: 'manual',
                explanation: 'Canasta sugerida desde alerta validada en servidor',
                items: [
                    {
                        productId: 'prod-low-1',
                        productName: 'Producto Bajo Stock',
                        sku: 'LOW-001',
                        currentStock: 1,
                        stockMin: 5,
                        deficit: 4,
                        suggestedQuantity: 4,
                        unitCost: 900,
                        suggestedSupplierId: 'sup-1',
                        suggestedSupplierName: 'Proveedor Test',
                        suggestedSupplierCost: 850,
                        reason: 'Stock actual 1 bajo mínimo 5',
                    },
                ],
            },
        });

        vi.mocked(createPurchaseOrderSecure).mockResolvedValue({
            success: true,
            data: {
                orderId: '550e8400-e29b-41d4-a716-446655440100',
                total: 4800,
                requiresApproval: false,
            },
        });

        vi.mocked(approvePurchaseOrderSecure).mockResolvedValue({ success: true });
    });

    it('mantiene controles táctiles mínimos en el formulario móvil', () => {
        render(<SmartOrderPage />);

        screen.getAllByRole('combobox').forEach((control) => {
            expect(control.className).toContain('min-h-11');
            expect(control.className).toContain('text-base');
        });
        screen.getAllByRole('spinbutton').forEach((control) => {
            expect(control.className).toContain('min-h-11');
            expect(control.className).toContain('text-base');
        });
        expect(screen.getByRole('button', { name: /Calcular Propuesta/i }).className).toContain('min-h-11');
    });

    it('crea la orden usando la bodega efectiva de la sucursal seleccionada', async () => {
        render(<SmartOrderPage />);

        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'loc-2' } });
        fireEvent.change(selects[1], { target: { value: 'sup-1' } });

        fireEvent.click(screen.getByRole('button', { name: /Calcular Propuesta/i }));

        await waitFor(() => {
            expect(generateRestockSuggestionSecure).toHaveBeenCalledWith('sup-1', 15, 30, 'loc-2');
        });

        fireEvent.click(screen.getByRole('button', { name: /Generar Orden/i }));

        await waitFor(() => {
            expect(createPurchaseOrderSecure).toHaveBeenCalledWith(
                expect.objectContaining({
                    supplierId: 'sup-1',
                    warehouseId: 'wh-2',
                    userId: '550e8400-e29b-41d4-a716-446655440999',
                }),
            );
        });
    });

    it('usa locationId de quick action como prefill validado sin calcular automáticamente', async () => {
        mocks.searchParams = new URLSearchParams({
            locationId: 'loc-2',
            warehouseId: 'wh-2',
            source: 'operational-suggestion',
            alertId: 'inventory-critical-low-stock',
        });
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });

        render(<SmartOrderPage />);

        const banner = screen.getByTestId('smart-order-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.accepted);
        expect(banner.textContent).toContain('contexto cargado');
        expect(banner.textContent).toContain('Sucursal preseleccionada: Sucursal Norte');
        expect(banner.textContent).toContain('Bodega validada: Bodega Norte');
        expect(screen.getByText('Flujo protegido con revisión manual')).toBeTruthy();
        expect(screen.queryByText(/Módulo V2/i)).toBeNull();
        expect(screen.getByTestId('smart-order-context-explanation').textContent).toContain(OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedContext);
        expect(screen.getByTestId('smart-order-context-explanation').textContent).toContain('el proveedor sigue manual');
        expect(screen.getByTestId('smart-order-context-source').textContent).toContain(OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedContext);
        expect(screen.getByTestId('smart-order-next-step').textContent).toContain('Contexto listo');
        expect(generateRestockSuggestionSecure).not.toHaveBeenCalled();
        expect(createPurchaseOrderSecure).not.toHaveBeenCalled();

        await waitFor(() => {
            expect(getSmartOrderLowStockPrefillSecure).toHaveBeenCalledWith({
                alertId: 'inventory-critical-low-stock',
                locationId: 'loc-2',
                warehouseId: 'wh-2',
                limit: 8,
            });
        });
        expect(screen.getByTestId('smart-order-low-stock-prefill').textContent).toContain('Producto Bajo Stock');
        expect(screen.getByTestId('smart-order-low-stock-prefill').textContent).toContain('Proveedor sugerido: Proveedor Test');

        await waitFor(() => {
            expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('loc-2');
        });
        await waitFor(() => {
            expect(emittedEvents).toEqual(expect.arrayContaining([
                'destination_opened',
                'destination_context_accepted',
            ]));
        });

        fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'sup-1' } });
        fireEvent.click(screen.getByRole('button', { name: /Calcular Propuesta/i }));

        await waitFor(() => {
            expect(generateRestockSuggestionSecure).toHaveBeenCalledWith('sup-1', 15, 30, 'loc-2');
        });
        expect(screen.getByTestId('smart-order-next-step').textContent).toContain('Propuesta lista');

        fireEvent.click(screen.getByRole('button', { name: /Generar Orden/i }));

        await waitFor(() => {
            expect(createPurchaseOrderSecure).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseId: 'wh-2',
                }),
            );
        });
    });

    it('aplica canasta de bajo stock sin seleccionar proveedor ni crear orden automáticamente', async () => {
        mocks.searchParams = new URLSearchParams({
            locationId: 'loc-2',
            warehouseId: 'wh-2',
            source: 'operational-suggestion',
            alertId: 'inventory-critical-low-stock',
        });

        render(<SmartOrderPage />);

        await waitFor(() => {
            expect(screen.getByText('Producto Bajo Stock')).toBeTruthy();
        });

        fireEvent.click(screen.getByRole('button', { name: /Usar canasta sugerida/i }));

        await waitFor(() => {
            expect(screen.getByText(/SKU: LOW-001/i)).toBeTruthy();
        });
        expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('');
        expect(screen.getByTestId('smart-order-next-step').textContent).toContain('selecciona proveedor manualmente');
        expect((screen.getByRole('button', { name: /Generar Orden/i }) as HTMLButtonElement).disabled).toBe(true);
        expect(createPurchaseOrderSecure).not.toHaveBeenCalled();
    });

    it('bloquea prefill de quick action con contexto inválido sin calcular ni crear órdenes', async () => {
        mocks.searchParams = new URLSearchParams({
            locationId: 'loc-missing',
            warehouseId: 'wh-missing',
            source: 'operational-suggestion',
            alertId: 'inventory-critical-low-stock',
        });
        vi.mocked(getSmartOrderLowStockPrefillSecure).mockResolvedValueOnce({
            success: false,
            error: 'Contexto de bajo stock inválido',
        });
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });

        render(<SmartOrderPage />);

        const banner = screen.getByTestId('smart-order-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.rejected);
        expect(banner.textContent).toContain(`${OPERATIONAL_AUTHORITY_LABELS.safePrefill} bloqueado`);
        expect(banner.textContent).toContain('Selecciona la sucursal manualmente');
        expect(screen.getByTestId('smart-order-context-explanation').textContent).toContain(OPERATIONAL_REJECTION_REASON_LABELS.outOfScope);
        expect(screen.getByTestId('smart-order-context-explanation').textContent).toContain('no pertenece al contexto visible');
        expect(screen.getByTestId('smart-order-context-source').textContent).toContain(OPERATIONAL_AUTHORITY_LABELS.serverSourceOfTruth);
        expect(generateRestockSuggestionSecure).not.toHaveBeenCalled();
        expect(createPurchaseOrderSecure).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByTestId('smart-order-low-stock-prefill').textContent).toContain('No se aplicó canasta sugerida');
        });

        await waitFor(() => {
            expect(emittedEvents).toEqual(expect.arrayContaining([
                'destination_opened',
                'destination_context_rejected',
            ]));
        });
    });
});
