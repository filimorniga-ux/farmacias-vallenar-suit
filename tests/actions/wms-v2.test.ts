/**
 * WMS V2 Tests - hardening de auth, scope e integridad
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TEST_BATCH_ID,
    TEST_LOCATION_ID,
    TEST_PRODUCT_ID,
    TEST_USERS,
    TEST_WAREHOUSE_ID,
} from '../fixtures';

const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440091';
const OTHER_WAREHOUSE_ID = '550e8400-e29b-41d4-a716-446655440092';
const TEST_SHIPMENT_ID = '550e8400-e29b-41d4-a716-446655440081';
const TEST_SHIPMENT_ITEM_ID = '550e8400-e29b-41d4-a716-446655440082';
const OTHER_SHIPMENT_ID = '550e8400-e29b-41d4-a716-446655440083';
const OTHER_CANCEL_SHIPMENT_ID = '550e8400-e29b-41d4-a716-446655440084';

const {
    mockQuery,
    mockRelease,
    mockConnect,
    mockPoolQuery,
    mockRequireInventoryActor,
    mockResolveEffectiveInventoryLocation,
    mockResolveWarehouseForInventoryActor,
    mockEnsureBatchInInventoryScope,
    mockHasGlobalInventoryScope,
    mockValidatePinForRoles,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockRelease: vi.fn(),
    mockConnect: vi.fn(),
    mockPoolQuery: vi.fn(),
    mockRequireInventoryActor: vi.fn(),
    mockResolveEffectiveInventoryLocation: vi.fn(),
    mockResolveWarehouseForInventoryActor: vi.fn(),
    mockEnsureBatchInInventoryScope: vi.fn(),
    mockHasGlobalInventoryScope: vi.fn(),
    mockValidatePinForRoles: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
}));

vi.mock('@/actions/inventory-scope', () => ({
    requireInventoryActor: (...args: unknown[]) => mockRequireInventoryActor(...args),
    resolveEffectiveInventoryLocation: (...args: unknown[]) => mockResolveEffectiveInventoryLocation(...args),
    resolveWarehouseForInventoryActor: (...args: unknown[]) => mockResolveWarehouseForInventoryActor(...args),
    ensureBatchInInventoryScope: (...args: unknown[]) => mockEnsureBatchInInventoryScope(...args),
    hasGlobalInventoryScope: (...args: unknown[]) => mockHasGlobalInventoryScope(...args),
}));

vi.mock('@/lib/pin-rbac', () => ({
    normalizeRole: (role: string | null | undefined) => String(role || '').trim().toUpperCase(),
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    cancelShipmentSecure,
    createReturnSecure,
    executeStockMovementSecure,
    getPurchaseOrdersSecure,
    getShipmentsSecure,
    getStockHistorySecure,
    processReceptionSecure,
} from '@/actions/wms-v2';

function makeActor(overrides: Partial<{
    userId: string;
    userName: string;
    role: string;
    locationId?: string;
    tokenVersion: number;
    sessionToken: string;
}> = {}) {
    return {
        userId: TEST_USERS.manager.id,
        userName: TEST_USERS.manager.name,
        role: 'ADMIN',
        locationId: TEST_LOCATION_ID,
        tokenVersion: 1,
        sessionToken: 'session-token',
        ...overrides,
    };
}

describe('WMS V2 - hardening visible', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockRequireInventoryActor.mockResolvedValue({
            success: true,
            actor: makeActor(),
        });

        mockHasGlobalInventoryScope.mockImplementation((role: string) =>
            ['ADMIN', 'GERENTE_GENERAL'].includes(String(role || '').trim().toUpperCase())
        );

        mockResolveEffectiveInventoryLocation.mockImplementation((actor, requestedLocationId?: string | null) => {
            const actorLocationId = String(actor?.locationId || '');
            const isGlobal = mockHasGlobalInventoryScope(actor?.role);

            if (isGlobal) {
                return { success: true, locationId: requestedLocationId || undefined };
            }

            if (requestedLocationId && requestedLocationId !== actorLocationId) {
                return { success: false, error: 'Acceso denegado a otra ubicación' };
            }

            return { success: true, locationId: actorLocationId || undefined };
        });

        mockResolveWarehouseForInventoryActor.mockImplementation((
            actor,
            requestedWarehouseId?: string | null,
            requestedLocationId?: string | null,
        ) => {
            const warehouseToLocation: Record<string, string> = {
                [TEST_WAREHOUSE_ID]: TEST_LOCATION_ID,
                [OTHER_WAREHOUSE_ID]: OTHER_LOCATION_ID,
            };

            if (requestedWarehouseId) {
                const warehouseLocationId = warehouseToLocation[String(requestedWarehouseId)];
                if (!warehouseLocationId) {
                    return Promise.resolve({ success: false, error: 'Bodega no encontrada' });
                }

                const scope = mockResolveEffectiveInventoryLocation(actor, warehouseLocationId);
                if (!scope.success) {
                    return Promise.resolve(scope);
                }

                return Promise.resolve({
                    success: true,
                    warehouseId: String(requestedWarehouseId),
                    locationId: warehouseLocationId,
                });
            }

            const locationId = String(requestedLocationId || actor?.locationId || TEST_LOCATION_ID);
            const scope = mockResolveEffectiveInventoryLocation(actor, locationId);
            if (!scope.success) {
                return Promise.resolve(scope);
            }

            return Promise.resolve({
                success: true,
                warehouseId: locationId === OTHER_LOCATION_ID ? OTHER_WAREHOUSE_ID : TEST_WAREHOUSE_ID,
                locationId,
            });
        });

        mockEnsureBatchInInventoryScope.mockResolvedValue({
            success: true,
            batch: {
                id: TEST_BATCH_ID,
                product_id: TEST_PRODUCT_ID,
                warehouse_id: TEST_WAREHOUSE_ID,
            },
            warehouseId: TEST_WAREHOUSE_ID,
            locationId: TEST_LOCATION_ID,
        });

        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: TEST_USERS.admin.id,
                name: TEST_USERS.admin.name,
                role: 'ADMIN',
            },
        });
    });

    it('rechaza productId inválido antes de tocar DB', async () => {
        const result = await executeStockMovementSecure({
            productId: 'no-es-uuid',
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 5,
            reason: 'Ajuste manual de prueba inválido',
            userId: TEST_USERS.manager.id,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('rechaza cashier intentando mutar stock WMS', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await executeStockMovementSecure({
            productId: TEST_PRODUCT_ID,
            warehouseId: TEST_WAREHOUSE_ID,
            type: 'ADJUSTMENT',
            quantity: 10,
            reason: 'Intento de ajuste sin permisos suficientes',
            userId: TEST_USERS.cashier.id,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('rechaza sobre-recepción y no crea stock', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT * FROM shipments')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_SHIPMENT_ID,
                        status: 'IN_TRANSIT',
                        destination_location_id: TEST_LOCATION_ID,
                        type: 'INTER_BRANCH',
                    }],
                });
            }
            if (sql.includes('SELECT * FROM shipment_items')) {
                return Promise.resolve({
                    rows: [{
                        id: TEST_SHIPMENT_ITEM_ID,
                        quantity: 10,
                        batch_id: TEST_BATCH_ID,
                        product_id: TEST_PRODUCT_ID,
                        sku: 'SKU-001',
                        name: 'Producto Test',
                    }],
                });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await processReceptionSecure({
            shipmentId: TEST_SHIPMENT_ID,
            receivedItems: [{
                itemId: TEST_SHIPMENT_ITEM_ID,
                quantity: 12,
                condition: 'GOOD',
            }],
            unexpectedItems: [],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('excede lo despachado');
        expect(
            mockQuery.mock.calls.some((call) => String(call[0]).includes('INSERT INTO inventory_batches'))
        ).toBe(false);
    });

    it('rechaza recepción fuera de la location efectiva del actor', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: true,
            actor: makeActor({
                userId: TEST_USERS.warehouse.id,
                userName: TEST_USERS.warehouse.name,
                role: 'WAREHOUSE',
                locationId: TEST_LOCATION_ID,
            }),
        });

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT * FROM shipments')) {
                return Promise.resolve({
                    rows: [{
                        id: OTHER_SHIPMENT_ID,
                        status: 'IN_TRANSIT',
                        destination_location_id: OTHER_LOCATION_ID,
                        type: 'INTER_BRANCH',
                    }],
                });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await processReceptionSecure({
            shipmentId: OTHER_SHIPMENT_ID,
            receivedItems: [{
                itemId: TEST_SHIPMENT_ITEM_ID,
                quantity: 10,
                condition: 'GOOD',
            }],
            unexpectedItems: [],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado a otra ubicación');
    });

    it('falla cerrado en devoluciones sin lote o stock real', async () => {
        mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.startsWith('SELECT type FROM locations')) {
                const requestedId = String(params?.[0] || '');
                return Promise.resolve({
                    rows: [{ type: requestedId === TEST_LOCATION_ID ? 'RETAIL_BRANCH' : 'WAREHOUSE' }],
                });
            }
            if (sql.includes('INSERT INTO shipments')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql.startsWith('SELECT id FROM warehouses WHERE location_id')) {
                return Promise.resolve({ rows: [{ id: TEST_WAREHOUSE_ID }] });
            }
            if (sql.startsWith('SELECT id, name FROM products WHERE sku')) {
                return Promise.resolve({ rows: [{ id: TEST_PRODUCT_ID, name: 'Producto Test' }] });
            }
            if (sql.includes('FROM inventory_batches') && sql.includes('FOR UPDATE NOWAIT')) {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await createReturnSecure({
            originLocationId: TEST_LOCATION_ID,
            destinationLocationId: OTHER_LOCATION_ID,
            items: [{
                sku: 'SKU-001',
                quantity: 5,
                condition: 'DAMAGED',
            }],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No hay lote disponible');
    });

    it('rechaza cancelar envíos ajenos a la location del actor', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: true,
            actor: makeActor({
                userId: TEST_USERS.warehouse.id,
                userName: TEST_USERS.warehouse.name,
                role: 'WAREHOUSE_CHIEF',
                locationId: TEST_LOCATION_ID,
            }),
        });

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('FROM shipments') && sql.includes('FOR UPDATE NOWAIT')) {
                return Promise.resolve({
                    rows: [{
                        id: OTHER_CANCEL_SHIPMENT_ID,
                        status: 'IN_TRANSIT',
                        origin_location_id: OTHER_LOCATION_ID,
                        destination_location_id: OTHER_LOCATION_ID,
                    }],
                });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await cancelShipmentSecure({ shipmentId: OTHER_CANCEL_SHIPMENT_ID });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('ancla getShipments al scope server-side e ignora locationId del cliente para no-globales', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: true,
            actor: makeActor({
                userId: TEST_USERS.warehouse.id,
                userName: TEST_USERS.warehouse.name,
                role: 'WAREHOUSE',
                locationId: TEST_LOCATION_ID,
            }),
        });

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getShipmentsSecure({
            locationId: OTHER_LOCATION_ID,
            direction: 'INCOMING',
            page: 1,
            pageSize: 10,
        });

        expect(result.success).toBe(true);
        expect(mockPoolQuery).toHaveBeenCalledTimes(2);
        expect(mockPoolQuery.mock.calls[0]?.[1]?.[0]).toBe(TEST_LOCATION_ID);
        expect(mockPoolQuery.mock.calls[0]?.[1]?.[0]).not.toBe(OTHER_LOCATION_ID);
    });

    it('ancla getPurchaseOrders al scope server-side e ignora locationId del cliente para no-globales', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: true,
            actor: makeActor({
                userId: TEST_USERS.warehouse.id,
                userName: TEST_USERS.warehouse.name,
                role: 'WAREHOUSE',
                locationId: TEST_LOCATION_ID,
            }),
        });

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getPurchaseOrdersSecure({
            locationId: OTHER_LOCATION_ID,
            page: 1,
            pageSize: 10,
        });

        expect(result.success).toBe(true);
        expect(mockPoolQuery.mock.calls[0]?.[1]?.[0]).toBe(TEST_LOCATION_ID);
        expect(mockPoolQuery.mock.calls[0]?.[1]?.[0]).not.toBe(OTHER_LOCATION_ID);
        expect(String(mockPoolQuery.mock.calls[1]?.[0] || '')).not.toContain('poi.product_id');
    });

    it('exige autenticación para historial WMS', async () => {
        mockRequireInventoryActor.mockResolvedValueOnce({
            success: false,
            error: 'Sesión no válida. Vuelve a iniciar sesión.',
        });

        const result = await getStockHistorySecure({
            warehouseId: TEST_WAREHOUSE_ID,
            page: 1,
            pageSize: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('aplica filtro de factura en historial WMS sin tocar mutaciones', async () => {
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getStockHistorySecure({
            warehouseId: TEST_WAREHOUSE_ID,
            movementType: 'PURCHASE_ENTRY',
            invoiceNumber: 'FAC-123',
            page: 1,
            pageSize: 10,
        });

        expect(result.success).toBe(true);
        expect(mockConnect).not.toHaveBeenCalled();
        expect(mockPoolQuery).toHaveBeenCalledTimes(2);

        const countSql = String(mockPoolQuery.mock.calls[0]?.[0] || '');
        const dataSql = String(mockPoolQuery.mock.calls[1]?.[0] || '');
        expect(countSql).toContain("COALESCE(sm.notes, '') ILIKE");
        expect(dataSql).toContain("COALESCE(sm.notes, '') ILIKE");
        expect(mockPoolQuery.mock.calls[0]?.[1]).toContain('%FAC-123%');
        expect(mockPoolQuery.mock.calls[1]?.[1]).toContain('%FAC-123%');
    });
});
