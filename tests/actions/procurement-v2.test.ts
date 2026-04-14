import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const mockPoolQuery = vi.fn();
const mockPoolConnect = vi.fn();
const mockQuery = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockValidatePinForRoles = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
        connect: (...args: unknown[]) => mockPoolConnect(...args),
    },
}));

vi.mock('@/lib/pin-rbac', () => {
    const normalizeRole = (role: string | null | undefined) => String(role || '').trim().toUpperCase();

    class MockPinRbacError extends Error {
        code: string;

        constructor(code = 'AUTH_UNAUTHORIZED', message = 'Acceso denegado') {
            super(message);
            this.name = 'MockPinRbacError';
            this.code = code;
        }
    }

    return {
        ROLE_GROUPS: {
            ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
            MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        },
        PinRbacError: MockPinRbacError,
        normalizeRole,
        requireRole: (actor: Record<string, unknown>, allowedRoles: readonly string[]) => {
            const normalizedActor = { ...actor, role: normalizeRole(String(actor.role || '')) };
            const allowed = allowedRoles.map(normalizeRole);
            if (!allowed.includes(String(normalizedActor.role))) {
                throw new MockPinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
            }
            return normalizedActor;
        },
        getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
        validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    };
});

vi.mock('@/actions/supply-v2', () => ({
    createPurchaseOrderSecure: vi.fn(),
    updatePurchaseOrderSecure: vi.fn(),
    receivePurchaseOrderSecure: vi.fn(),
    cancelPurchaseOrderSecure: vi.fn(),
    deletePurchaseOrderSecure: vi.fn(),
}));

import * as supplyActions from '@/actions/supply-v2';
import {
    approvePurchaseOrderSecure,
    cancelPurchaseOrderSecure,
    createPurchaseOrderSecure,
    deletePurchaseOrderSecure,
    generateRestockSuggestionSecure,
    getPurchaseOrderHistory,
    getSuggestionAnalysisHistorySecure,
    getTransferDetailHistorySecure,
    receivePurchaseOrderSecure,
} from '@/actions/procurement-v2';

describe('Procurement V2 Hardening', () => {
    const actorLocationId = '550e8400-e29b-41d4-a716-446655440099';
    const validUuid = '550e8400-e29b-41d4-a716-446655440111';
    const orderId = '550e8400-e29b-41d4-a716-446655440222';

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActorOrFail.mockResolvedValue({
            userId: validUuid,
            role: 'ADMIN',
            userName: 'Admin Procurement',
            locationId: actorLocationId,
            tokenVersion: 1,
            sessionToken: 'procurement-session',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: '550e8400-e29b-41d4-a716-446655440333',
                name: 'Approver',
                role: 'ADMIN',
            },
        });
        vi.mocked(supplyActions.createPurchaseOrderSecure).mockReset();
        vi.mocked(supplyActions.updatePurchaseOrderSecure).mockReset();
        vi.mocked(supplyActions.receivePurchaseOrderSecure).mockReset();
        vi.mocked(supplyActions.cancelPurchaseOrderSecure).mockReset();
        vi.mocked(supplyActions.deletePurchaseOrderSecure).mockReset();
    });

    it('genera sugerencias usando la ubicación efectiva del actor', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: validUuid,
            role: 'MANAGER',
            userName: 'Manager Procurement',
            locationId: actorLocationId,
            tokenVersion: 1,
            sessionToken: 'procurement-session-manager',
        });
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{
                product_id: 'prod-1',
                product_name: 'Paracetamol',
                sku: 'PARA500',
                current_stock: 10,
                other_warehouses_stock: 0,
                sold_7d: 14,
                sold_15d: 30,
                sold_30d: 60,
                sold_60d: 120,
                sold_90d: 180,
                sold_180d: 360,
                sold_365d: 730,
                safety_stock: 5,
                incoming_stock: 0,
                unit_cost: 100,
                internal_cost: 100,
                suppliers_data: null,
                stock_by_location: [],
                total_sold_in_period: 60,
                sales_history: [],
            }],
        });

        const result = await generateRestockSuggestionSecure(undefined, 10, 30, undefined, undefined, 'PARA', 25);

        expect(result.success).toBe(true);
        expect(result.data?.[0]?.suggested_order_qty).toBe(15);
        expect(mockPoolQuery.mock.calls[0]?.[1]).toContain(actorLocationId);
    });

    it('rechaza historial de análisis cross-location para actores no globales', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: validUuid,
            role: 'MANAGER',
            userName: 'Manager Procurement',
            locationId: actorLocationId,
            tokenVersion: 1,
            sessionToken: 'procurement-session',
        });

        const result = await getSuggestionAnalysisHistorySecure({
            locationId: '550e8400-e29b-41d4-a716-446655440444',
            limit: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('usa supply-v2 como writer canónico al crear órdenes', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ location_id: actorLocationId }],
            rowCount: 1,
        });
        vi.mocked(supplyActions.createPurchaseOrderSecure).mockResolvedValue({
            success: true,
            orderId,
        });

        const result = await createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440555',
            warehouseId: '550e8400-e29b-41d4-a716-446655440556',
            userId: '550e8400-e29b-41d4-a716-446655440999',
            items: [{ productName: 'Expensive', sku: 'SKU001', quantity: 1000, unitCost: 600 }],
        });

        expect(result.success).toBe(true);
        expect(result.data?.requiresApproval).toBe(true);
        expect(vi.mocked(supplyActions.createPurchaseOrderSecure)).toHaveBeenCalledWith(
            expect.objectContaining({
                targetWarehouseId: '550e8400-e29b-41d4-a716-446655440556',
            }),
            validUuid,
        );
    });

    it('usa supply-v2 como writer canónico al aprobar órdenes', async () => {
        const clientQuery = vi.fn(async (sql: string) => {
            if (sql.startsWith('BEGIN') || sql.startsWith('ROLLBACK')) {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('FROM purchase_orders po') && sql.includes('LEFT JOIN warehouses')) {
                return {
                    rows: [{
                        id: orderId,
                        status: 'DRAFT',
                        total_amount: 700000,
                        supplier_id: '550e8400-e29b-41d4-a716-446655440555',
                        target_warehouse_id: '550e8400-e29b-41d4-a716-446655440556',
                        location_id: actorLocationId,
                        notes: 'Notas previas',
                    }],
                    rowCount: 1,
                } as const;
            }
            if (sql.includes('SELECT id, status, total_amount')) {
                return {
                    rows: [{
                        id: orderId,
                        status: 'DRAFT',
                        total_amount: 700000,
                        supplier_id: '550e8400-e29b-41d4-a716-446655440555',
                        target_warehouse_id: '550e8400-e29b-41d4-a716-446655440556',
                        notes: 'Notas previas',
                    }],
                    rowCount: 1,
                } as const;
            }
            if (sql.includes('FROM purchase_order_items')) {
                return {
                    rows: [{ sku: 'SKU001', name: 'Prod', quantity_ordered: 2, cost_price: 1000 }],
                    rowCount: 1,
                } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });
        vi.mocked(supplyActions.updatePurchaseOrderSecure).mockResolvedValue({
            success: true,
            orderId,
        });

        const result = await approvePurchaseOrderSecure({
            orderId,
            approverPin: '1234',
            notes: 'Aprobación suficientemente larga',
        });

        expect(result.success).toBe(true);
        expect(vi.mocked(supplyActions.updatePurchaseOrderSecure)).toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ status: 'APPROVED' }),
            validUuid,
        );
    });

    it('usa supply-v2 como writer canónico al recepcionar órdenes', async () => {
        const itemId = '550e8400-e29b-41d4-a716-446655440444';
        const clientQuery = vi.fn(async (sql: string) => {
            if (sql.startsWith('BEGIN') || sql.startsWith('ROLLBACK')) {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('FROM purchase_orders po') && sql.includes('LEFT JOIN warehouses')) {
                return {
                    rows: [{ id: orderId, status: 'APPROVED', location_id: actorLocationId }],
                    rowCount: 1,
                } as const;
            }
            if (sql.includes('FROM purchase_order_items')) {
                return {
                    rows: [{ id: itemId, sku: 'SKU001' }],
                    rowCount: 1,
                } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });
        vi.mocked(supplyActions.receivePurchaseOrderSecure).mockResolvedValue({ success: true });

        const result = await receivePurchaseOrderSecure({
            orderId,
            userId: validUuid,
            receivedItems: [{ itemId, quantityReceived: 5 }],
        });

        expect(result.success).toBe(true);
        expect(vi.mocked(supplyActions.receivePurchaseOrderSecure)).toHaveBeenCalledWith(
            expect.objectContaining({
                purchaseOrderId: orderId,
                receivedItems: [expect.objectContaining({ sku: 'SKU001', quantity: 5 })],
            }),
            validUuid,
        );
    });

    it('usa supply-v2 como writer canónico al cancelar y eliminar órdenes', async () => {
        const clientQuery = vi.fn(async (sql: string) => {
            if (sql.startsWith('BEGIN') || sql.startsWith('ROLLBACK')) {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('FROM purchase_orders po') && sql.includes('LEFT JOIN warehouses')) {
                return {
                    rows: [{ id: orderId, status: 'APPROVED', location_id: actorLocationId }],
                    rowCount: 1,
                } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });
        vi.mocked(supplyActions.cancelPurchaseOrderSecure).mockResolvedValue({ success: true });
        vi.mocked(supplyActions.deletePurchaseOrderSecure).mockResolvedValue({ success: true });

        const cancelResult = await cancelPurchaseOrderSecure({
            orderId,
            reason: 'Razón de cancelación suficientemente larga',
            cancelerPin: '1234',
        });
        const deleteResult = await deletePurchaseOrderSecure({ orderId, userId: validUuid });

        expect(cancelResult.success).toBe(true);
        expect(deleteResult.success).toBe(true);
        expect(vi.mocked(supplyActions.cancelPurchaseOrderSecure)).toHaveBeenCalledWith(orderId, validUuid, expect.any(String));
        expect(vi.mocked(supplyActions.deletePurchaseOrderSecure)).toHaveBeenCalledWith({ orderId, userId: validUuid });
    });

    it('niega detalle de traspaso fuera de scope', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: validUuid,
            role: 'MANAGER',
            userName: 'Manager Procurement',
            locationId: actorLocationId,
            tokenVersion: 1,
            sessionToken: 'procurement-session-manager',
        });
        mockQuery.mockResolvedValueOnce({
            rows: [{ location_id: '550e8400-e29b-41d4-a716-446655440777' }],
            rowCount: 1,
        });

        const result = await getTransferDetailHistorySecure('550e8400-e29b-41d4-a716-446655440888');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('fuerza scope en getPurchaseOrderHistory para actores no globales', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: validUuid,
            role: 'MANAGER',
            userName: 'Manager Procurement',
            locationId: actorLocationId,
            tokenVersion: 1,
            sessionToken: 'procurement-session-manager',
        });
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await getPurchaseOrderHistory({
            status: 'APPROVED',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(String(mockPoolQuery.mock.calls[0]?.[0] || '')).toContain('LEFT JOIN warehouses w');
        expect(mockPoolQuery.mock.calls[0]?.[1]).toContain(actorLocationId);
    });
});
