/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OPERATIONAL_QUICK_ACTION_UX_EVENT } from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
} from '@/lib/operational-message-catalog';

const mocks = vi.hoisted(() => {
    const getActiveSessionMock = vi.fn();
    const getSessionMock = vi.fn();
    const clearSessionMock = vi.fn();
    const cartItems: Array<{
        id: string;
        batchId: string;
        name: string;
        price: number;
        quantity: number;
        stock: number;
        condition?: string;
    }> = [];
    const addToCartMock = vi.fn();
    const removeFromCartMock = vi.fn();
    const updateQuantityMock = vi.fn();
    const clearCartMock = vi.fn();
    const getCartTotalMock = vi.fn(() => 0);
    const findBestBatchSecureMock = vi.fn();
    const getProductsSecureMock = vi.fn();
    const createSaleSecureMock = vi.fn();
    const shiftModalPropsMock = vi.fn();

    const pharmaState = {
        currentTerminalId: '',
        currentLocationId: '',
        inventory: [],
    };

    const usePharmaStoreMock = Object.assign(
        function <T>(selector?: (state: typeof pharmaState) => T) {
            return selector ? selector(pharmaState) : (pharmaState as T);
        },
        {
            getState: () => pharmaState,
            setState: vi.fn((partial: Partial<typeof pharmaState>) => {
                Object.assign(pharmaState, partial);
            }),
        }
    );

    return {
        getActiveSessionMock,
        getSessionMock,
        clearSessionMock,
        cartItems,
        addToCartMock,
        removeFromCartMock,
        updateQuantityMock,
        clearCartMock,
        getCartTotalMock,
        findBestBatchSecureMock,
        getProductsSecureMock,
        createSaleSecureMock,
        shiftModalPropsMock,
        pharmaState,
        usePharmaStoreMock,
        searchParams: new URLSearchParams(),
    };
});

vi.mock('next/navigation', () => ({
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@sentry/nextjs', () => ({
    addBreadcrumb: vi.fn(),
}));

vi.mock('@/actions/terminals-v2', () => ({
    getActiveSession: mocks.getActiveSessionMock,
}));

vi.mock('@/actions/inventory-v2', () => ({
    findBestBatchSecure: mocks.findBestBatchSecureMock,
}));

vi.mock('@/actions/sales-v2', () => ({
    createSaleSecure: mocks.createSaleSecureMock,
}));

vi.mock('@/actions/get-products-v2', () => ({
    getProductsSecure: mocks.getProductsSecureMock,
}));

vi.mock('@/hooks/useTerminalSession', () => ({
    useTerminalSession: () => ({
        getSession: mocks.getSessionMock,
        clearSession: mocks.clearSessionMock,
    }),
}));

vi.mock('@/components/auth/RouteGuard', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ticket/TicketBoleta', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/ui/SyncStatusBadge', () => ({
    SyncStatusBadge: () => <div data-testid="sync-status" />,
}));

vi.mock('@/presentation/components/quotes/QuoteHistoryModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('@/presentation/components/pos/ShiftManagementModal', () => ({
    __esModule: true,
    default: (props: { isOpen: boolean; onClose: () => void }) => {
        mocks.shiftModalPropsMock(props);
        return props.isOpen ? <div data-testid="shift-management-modal">Apertura de Caja</div> : null;
    },
}));

vi.mock('@/lib/store/cart', () => ({
    useCartStore: () => ({
        cart: mocks.cartItems,
        addToCart: mocks.addToCartMock,
        removeFromCart: mocks.removeFromCartMock,
        updateQuantity: mocks.updateQuantityMock,
        clearCart: mocks.clearCartMock,
        getCartTotal: mocks.getCartTotalMock,
    }),
}));

vi.mock('@/lib/store/offlineSales', () => ({
    useOfflineSales: () => ({
        pendingSales: [],
        addOfflineSale: vi.fn(),
        removeOfflineSale: vi.fn(),
    }),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => true,
}));

vi.mock('@/lib/store/useAuthStore', () => ({
    useAuthStore: () => ({
        user: { id: 'user-1' },
    }),
}));

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: mocks.usePharmaStoreMock,
}));

vi.mock('@/lib/inventory-utils', () => ({
    searchProductsLocal: vi.fn(() => []),
    findBestBatchLocal: vi.fn(() => ({ success: false })),
}));

describe('/app/caja/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks.pharmaState, {
            currentTerminalId: '',
            currentLocationId: '',
            inventory: [],
        });
        mocks.cartItems.splice(0, mocks.cartItems.length);
        mocks.getCartTotalMock.mockReturnValue(0);
        mocks.findBestBatchSecureMock.mockResolvedValue({ success: false });
        mocks.getProductsSecureMock.mockResolvedValue({ success: true, data: [] });
        mocks.createSaleSecureMock.mockResolvedValue({ success: true, saleId: 'sale-1' });
        mocks.searchParams = new URLSearchParams();

        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: vi.fn((key: string) => {
                    if (key === 'current_location_id') return 'loc-current';
                    if (key === 'context_location_id') return 'loc-context';
                    return null;
                }),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
        });
    });

    it('usa la sesión POS dedicada como bootstrap y valida la sesión visible con el servidor', async () => {
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        await waitFor(() => {
            expect(mocks.getActiveSessionMock).toHaveBeenCalledWith('term-bootstrap');
        });

        expect(screen.getByTestId('caja-status-open').textContent).toContain('Caja Abierta: Caja 1');
        expect(screen.getByTestId('caja-readiness-hint').textContent).toContain('Listo para vender');
        expect(mocks.usePharmaStoreMock.setState).toHaveBeenCalledWith({ currentTerminalId: 'term-bootstrap' });
        expect(mocks.usePharmaStoreMock.setState).toHaveBeenCalledWith({ currentLocationId: 'loc-session' });
    });

    it('expone controles del carro con labels accesibles sin cambiar el flujo de venta', async () => {
        mocks.cartItems.push({
            id: 'item-1',
            batchId: 'batch-12345678',
            name: 'Paracetamol 500mg',
            price: 1000,
            quantity: 1,
            stock: 5,
        });
        mocks.getCartTotalMock.mockReturnValue(1000);
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        await screen.findByText('Paracetamol 500mg');
        fireEvent.click(screen.getByRole('button', { name: /Disminuir cantidad de Paracetamol 500mg/i }));
        fireEvent.click(screen.getByRole('button', { name: /Aumentar cantidad de Paracetamol 500mg/i }));
        fireEvent.click(screen.getByRole('button', { name: /Eliminar Paracetamol 500mg del carro/i }));

        expect(mocks.updateQuantityMock).toHaveBeenCalledWith('item-1', -1);
        expect(mocks.updateQuantityMock).toHaveBeenCalledWith('item-1', 1);
        expect(mocks.removeFromCartMock).toHaveBeenCalledWith('item-1');
    });

    it('invalida el hint local cuando el servidor no confirma una sesión activa', async () => {
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-stale',
            terminalId: 'term-stale',
            terminalName: 'Caja 9',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: false,
            error: 'No hay sesión de caja activa. Abra turno para comenzar.',
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        await waitFor(() => {
            expect(mocks.getActiveSessionMock).toHaveBeenCalledWith('term-stale');
            expect(mocks.clearSessionMock).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByTestId('caja-status-closed').textContent).toContain('No hay sesión de caja activa');
        expect(screen.getByTestId('caja-readiness-hint').textContent).toContain('Caja sin sesión validada');
    });

    it('abre el flujo de apertura de caja desde el POS cuando no hay sesión validada', async () => {
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-stale',
            terminalId: 'term-stale',
            terminalName: 'Caja 9',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: false,
            error: 'No hay sesión de caja activa. Abra turno para comenzar.',
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        const openShiftButton = await screen.findByRole('button', { name: /abrir caja/i });
        fireEvent.click(openShiftButton);

        expect((await screen.findByTestId('shift-management-modal')).textContent).toContain('Apertura de Caja');
        expect(mocks.shiftModalPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
            isOpen: true,
            onClose: expect.any(Function),
        }));
    });

    it('muestra contexto de quick action sin cambiar la sesión validada por URL', async () => {
        mocks.searchParams = new URLSearchParams({
            source: 'operational-suggestion',
            alertId: 'sales-no-activity',
            locationId: 'loc-query',
        });
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        const banner = await screen.findByTestId('caja-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.rejected);
        expect(banner.textContent).toContain('Revisar apertura de caja');
        expect(banner.textContent).toContain('La alerta venía con otra sucursal');
        expect(banner.textContent).toContain(OPERATIONAL_AUTHORITY_LABELS.noUrlAuthority);
        expect(screen.getByTestId('caja-context-explanation').textContent).toContain(OPERATIONAL_REJECTION_REASON_LABELS.inconsistent);
        expect(screen.getByTestId('caja-context-explanation').textContent).toContain('no coincide con la sesión validada');

        await waitFor(() => {
            expect(mocks.usePharmaStoreMock.setState).toHaveBeenCalledWith({ currentLocationId: 'loc-session' });
        });
        expect(emittedEvents).toEqual(expect.arrayContaining([
            'destination_opened',
            'destination_context_rejected',
        ]));
    });

    it('muestra contexto de quick action aceptado cuando coincide con la sesión validada', async () => {
        mocks.searchParams = new URLSearchParams({
            source: 'operational-suggestion',
            alertId: 'sales-no-activity',
            locationId: 'loc-session',
        });
        const emittedEvents: string[] = [];
        window.addEventListener(OPERATIONAL_QUICK_ACTION_UX_EVENT, (event) => {
            emittedEvents.push((event as CustomEvent<{ event: string }>).detail.event);
        });
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        const banner = await screen.findByTestId('caja-quick-action-context');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_STATUS_LABELS.accepted);
        expect(banner.textContent).toContain('Revisar apertura de caja');
        expect(banner.textContent).toContain(OPERATIONAL_CONTEXT_ORIGIN_LABELS.validatedSession);
        expect(banner.textContent).toContain('Sucursal validada');
        expect(screen.getByTestId('caja-context-explanation').textContent).toContain(OPERATIONAL_CONTEXT_ORIGIN_LABELS.validatedSession);
        expect(screen.getByTestId('caja-context-explanation').textContent).toContain('la URL solo explica la alerta');

        await waitFor(() => {
            expect(banner.textContent).toContain('Caja: Caja 1');
        });
        await waitFor(() => {
            expect(emittedEvents).toEqual(expect.arrayContaining([
                'destination_opened',
                'destination_context_accepted',
            ]));
        });
    });

    it('no muestra warning de receta para producto de venta directa', async () => {
        mocks.cartItems.push({
            id: 'item-vd',
            batchId: 'batch-vd',
            name: 'Paracetamol 500mg',
            price: 1000,
            quantity: 1,
            stock: 5,
            condition: 'VD',
        });
        mocks.getCartTotalMock.mockReturnValue(1000);
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        await screen.findByText('Paracetamol 500mg');
        expect(screen.queryByText(/Condición de venta: receta/i)).toBeNull();
    });

    it.each(['R', 'RR', 'RCH'])(
        'muestra warning informativo para condición %s sin bloquear pago ni pedir documento',
        async (condition) => {
            mocks.cartItems.push({
                id: `item-${condition}`,
                batchId: `batch-${condition}`,
                name: `Producto receta ${condition}`,
                price: 1000,
                quantity: 1,
                stock: 5,
                condition,
            });
            mocks.getCartTotalMock.mockReturnValue(1000);
            mocks.getSessionMock.mockReturnValue({
                sessionId: 'sess-1',
                terminalId: 'term-bootstrap',
                terminalName: 'Caja 1',
                userId: 'user-1',
                locationId: 'loc-session',
                openedAt: Date.now(),
                openingAmount: 5000,
            });
            mocks.getActiveSessionMock.mockResolvedValue({
                success: true,
                data: {
                    sessionId: 'sess-1',
                    terminalName: 'Caja 1',
                    openedAt: new Date().toISOString(),
                    userId: 'user-1',
                    openingAmount: 5000,
                },
            });

            const { default: CajaPage } = await import('@/app/caja/page');
            render(<CajaPage />);

            const warning = await screen.findByTestId(`caja-prescription-warning-item-${condition}`);
            expect(warning.textContent).toContain(`Condición de venta: receta (${condition})`);
            expect((screen.getByTestId('caja-confirm-payment') as HTMLButtonElement).disabled).toBe(false);
            expect(screen.queryByText(/Folio Receta/i)).toBeNull();
            expect(screen.queryByText(/RUT Médico/i)).toBeNull();
            expect(screen.queryByText(/Receta Física Archivada/i)).toBeNull();
        }
    );

    it('deriva el warning desde el lote resuelto por query segura al agregar al carro', async () => {
        mocks.getSessionMock.mockReturnValue({
            sessionId: 'sess-1',
            terminalId: 'term-bootstrap',
            terminalName: 'Caja 1',
            userId: 'user-1',
            locationId: 'loc-session',
            openedAt: Date.now(),
            openingAmount: 5000,
        });
        mocks.getActiveSessionMock.mockResolvedValue({
            success: true,
            data: {
                sessionId: 'sess-1',
                terminalName: 'Caja 1',
                openedAt: new Date().toISOString(),
                userId: 'user-1',
                openingAmount: 5000,
            },
        });
        mocks.getProductsSecureMock.mockResolvedValue({
            success: true,
            data: [{
                id: 'prod-rr',
                sku: 'SKU-RR',
                name: 'Producto controlado',
                price: 1000,
                condition: 'R',
                format: 'Unidad',
                location_name: 'Centro',
            }],
        });
        mocks.findBestBatchSecureMock.mockResolvedValue({
            success: true,
            batch: {
                id: 'batch-rr',
                sku: 'SKU-RR',
                name: 'Producto controlado',
                price: 1000,
                quantity: 5,
                condition: 'RR',
                lotNumber: null,
                expiryDate: null,
            },
        });

        const { default: CajaPage } = await import('@/app/caja/page');
        render(<CajaPage />);

        fireEvent.change(await screen.findByTestId('caja-search-input'), {
            target: { value: 'controlado' },
        });

        const result = await screen.findByRole('button', { name: /Producto controlado/i }, { timeout: 1500 });
        expect(screen.getByTestId('caja-search-prescription-warning-prod-rr').textContent).toContain('receta (R)');
        fireEvent.click(result);

        await waitFor(() => {
            expect(mocks.findBestBatchSecureMock).toHaveBeenCalledWith('SKU-RR', 'loc-session');
            expect(mocks.addToCartMock).toHaveBeenCalledWith(expect.objectContaining({
                batchId: 'batch-rr',
                condition: 'RR',
                requiresPrescription: false,
            }));
        });
    });
});
