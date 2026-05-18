import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as locationsV2 from '@/actions/locations-v2';
import * as dbModule from '@/lib/db';

const VALID_UUID_ADMIN = '550e8400-e29b-41d4-a716-446655440100';
const VALID_UUID_MANAGER = '550e8400-e29b-41d4-a716-446655440101';
const VALID_UUID_LOC_1 = '550e8400-e29b-41d4-a716-446655440200';
const VALID_UUID_LOC_2 = '550e8400-e29b-41d4-a716-446655440201';
const VALID_UUID_USER_1 = '550e8400-e29b-41d4-a716-446655440300';
const VALID_UUID_BATCH_1 = '550e8400-e29b-41d4-a716-446655440400';

const {
    mockGetActorOrFail,
    mockValidatePinForRoles,
    PinRbacErrorMock,
} = vi.hoisted(() => {
    class PinRbacErrorMock extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockGetActorOrFail: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        PinRbacErrorMock,
    };
});

vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn()
    },
    query: vi.fn()
}));

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    requireRole: (actor: { role?: string }, allowedRoles: readonly string[]) => {
        const normalizedRole = String(actor.role || '').trim().toUpperCase();
        const normalizedAllowed = allowedRoles.map((role) => String(role).trim().toUpperCase());
        if (!normalizedAllowed.includes(normalizedRole)) {
            throw new PinRbacErrorMock('AUTH_FORBIDDEN', 'Acceso denegado');
        }
        return actor;
    },
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'],
    },
    PinRbacError: PinRbacErrorMock,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('uuid', () => ({
    v4: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999')
}));

const mockAdminActor = {
    userId: VALID_UUID_ADMIN,
    role: 'ADMIN',
    locationId: VALID_UUID_LOC_1,
    userName: 'Admin User',
    tokenVersion: 1,
    sessionToken: 'token',
};

const mockManagerActor = {
    userId: VALID_UUID_MANAGER,
    role: 'MANAGER',
    locationId: VALID_UUID_LOC_1,
    userName: 'Manager User',
    tokenVersion: 1,
    sessionToken: 'token',
};

const mockLocation = {
    id: VALID_UUID_LOC_1,
    name: 'Sucursal Centro',
    type: 'STORE',
    is_active: true
};

beforeEach(() => {
    vi.clearAllMocks();
    mockGetActorOrFail.mockResolvedValue(mockAdminActor);
    mockValidatePinForRoles.mockResolvedValue({
        valid: true,
        authorizedBy: {
            id: '550e8400-e29b-41d4-a716-446655440555',
            name: 'Manager PIN',
            role: 'MANAGER',
        },
    });
});

describe('Locations V2 - RBAC', () => {
    it('permite ADMIN crear location', async () => {
        createMockClient([
            { rows: [], rowCount: 0 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.createLocationSecure({
            name: 'Nueva Sucursal',
            type: 'STORE'
        });

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe('Nueva Sucursal');
    });

    it('rechaza actor sin rol ADMIN al crear location', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            ...mockAdminActor,
            role: 'CASHIER',
            userName: 'Caja'
        });

        const result = await locationsV2.createLocationSecure({
            name: 'Nueva Sucursal',
            type: 'STORE'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ADMIN');
    });
});

describe('Locations V2 - Deactivation', () => {
    it('soft delete de sucursal', async () => {
        const mockClient = createMockClient([
            { rows: [mockLocation], rowCount: 1 },
            { rows: [{ count: '0' }], rowCount: 1 },
            { rows: [{ count: '0' }], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.deactivateLocationSecure(
            VALID_UUID_LOC_1,
            'Sucursal cerrada por remodelación'
        );

        expect(result.success).toBe(true);

        const updateCall = mockClient.query.mock.calls.find(
            (call) => (call[0] as string).includes('UPDATE locations') &&
                (call[0] as string).includes('is_active = false')
        );
        expect(updateCall).toBeDefined();
    });

    it('evita desactivar sucursal con usuarios activos', async () => {
        createMockClient([
            { rows: [mockLocation], rowCount: 1 },
            { rows: [{ count: '3' }], rowCount: 1 }
        ]);

        const result = await locationsV2.deactivateLocationSecure(
            VALID_UUID_LOC_1,
            'Closing location by business decision'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('usuarios');
    });
});

describe('Locations V2 - Stock Transfer', () => {
    it('transfiere stock con actor de sesión y deja authorized_by como metadato', async () => {
        mockGetActorOrFail.mockResolvedValueOnce(mockManagerActor);

        const mockClient = createMockClient([
            {
                rows: [
                    { id: VALID_UUID_LOC_1, name: 'Origen', is_active: true },
                    { id: VALID_UUID_LOC_2, name: 'Destino', is_active: true }
                ], rowCount: 2
            },
            {
                rows: [{
                    id: VALID_UUID_BATCH_1,
                    sku: 'SKU001',
                    name: 'Product',
                    quantity_real: 100,
                    lot_number: 'LOT001',
                    product_id: '550e8400-e29b-41d4-a716-446655440777',
                    expiry_date: null,
                    unit_cost: 100,
                    sale_price: 150,
                }], rowCount: 1
            },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_2,
            items: [{ sku: 'SKU001', quantity: 10 }],
            reason: 'Reabastecimiento entre sucursales',
            managerPin: '1234'
        });

        expect(result.success).toBe(true);
        const movementInsert = mockClient.query.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO stock_movements')
        );
        expect(movementInsert).toBeDefined();
        const movementCall = (movementInsert ?? []) as unknown as unknown[];
        const movementParams = Array.isArray(movementCall[1]) ? movementCall[1] as unknown[] : [];
        expect(movementParams).toContain(VALID_UUID_MANAGER);

        const auditInsert = mockClient.query.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO audit_log')
        );
        const auditCall = (auditInsert ?? []) as unknown as unknown[];
        const auditParams = Array.isArray(auditCall[1]) ? auditCall[1] as unknown[] : [];
        expect(auditParams[0]).toBe(VALID_UUID_MANAGER);
        const auditPayload = JSON.parse(String(auditParams[4] || '{}')) as Record<string, unknown>;
        expect(auditPayload.authorized_by_id).toBe('550e8400-e29b-41d4-a716-446655440555');
        expect(auditPayload.actor_user_id).toBe(VALID_UUID_MANAGER);
    });

    it('rechaza stock insuficiente', async () => {
        mockGetActorOrFail.mockResolvedValueOnce(mockManagerActor);

        createMockClient([
            {
                rows: [
                    { id: VALID_UUID_LOC_1, name: 'Origen', is_active: true },
                    { id: VALID_UUID_LOC_2, name: 'Destino', is_active: true }
                ], rowCount: 2
            },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_2,
            items: [{ sku: 'SKU001', quantity: 100 }],
            reason: 'Transfer',
            managerPin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('insuficiente');
    });
});

describe('Locations V2 - User Assignment', () => {
    it('assignUserToLocationSecure funciona para actor ADMIN', async () => {
        createMockClient([
            { rows: [mockLocation], rowCount: 1 },
            { rows: [{ id: VALID_UUID_USER_1, name: 'User', assigned_location_id: null }], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.assignUserToLocationSecure(
            VALID_UUID_USER_1,
            VALID_UUID_LOC_1,
            'Transferido a nueva sucursal'
        );

        expect(result.success).toBe(true);
    });
});

describe('Locations V2 - Inventory Summary', () => {
    it('retorna resumen de inventario', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{
                total_skus: '45',
                total_units: '1250',
                total_value: '2500000',
                low_stock: '5',
                expiring_soon: '3'
            }],
            rowCount: 1,
            command: '',
            oid: 0,
            fields: []
        });

        const result = await locationsV2.getLocationInventorySummary(VALID_UUID_LOC_1);

        expect(result.success).toBe(true);
        expect(result.data?.totalSKUs).toBe(45);
        expect(result.data?.totalUnits).toBe(1250);
        expect(result.data?.lowStockItems).toBe(5);
    });
});

function createMockClient(queryResults: Record<string, unknown>[] = []) {
    let callIndex = 0;

    const mockClient = {
        query: vi.fn((sql: string) => {
            const emptyResult = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return Promise.resolve(emptyResult);
            }

            if (callIndex < queryResults.length) {
                return Promise.resolve({ ...emptyResult, ...queryResults[callIndex++] });
            }

            return Promise.resolve(emptyResult);
        }),
        release: vi.fn()
    };

    vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);

    return mockClient;
}
