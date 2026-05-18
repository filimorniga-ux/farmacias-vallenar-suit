import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        async generateReport() {
            return Buffer.from('excel');
        }
    },
}));

const mockDbQuery = vi.fn();
const mockPoolConnect = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockValidatePinForRoles = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockDbQuery(...args),
    pool: {
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

import * as supplyV2 from '@/actions/supply-v2';

describe('Supply V2 Hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActorOrFail.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            role: 'ADMIN',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            userName: 'Admin Supply',
            tokenVersion: 1,
            sessionToken: 'supply-session-token',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: '550e8400-e29b-41d4-a716-446655440777',
                name: 'Manager Supply',
                role: 'MANAGER',
            },
        });
        mockDbQuery.mockReset();
        mockPoolConnect.mockReset();
    });

    it('rechaza createPurchaseOrderSecure con userId inválido', async () => {
        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440000',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU001', name: 'Test', quantity: 10, cost: 100, productId: null }],
        }, 'invalid-user-id');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('usa el actor validado y persiste supplier null para TRANSFER', async () => {
        const actorUserId = '550e8400-e29b-41d4-a716-446655440888';
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: actorUserId,
            role: 'ADMIN',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            userName: 'Actor Supply',
            tokenVersion: 2,
            sessionToken: 'supply-session-2',
        });

        const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('SELECT location_id::text AS location_id FROM warehouses')) {
                return { rows: [{ location_id: '550e8400-e29b-41d4-a716-446655440099' }], rowCount: 1 } as const;
            }
            if (sql.includes('INSERT INTO purchase_orders')) {
                expect(params?.[1]).toBeNull();
                expect(params?.[5]).toBe(actorUserId);
                return { rows: [], rowCount: 1 } as const;
            }
            if (sql.includes('INSERT INTO purchase_order_items') || sql.includes('INSERT INTO audit_log')) {
                return { rows: [], rowCount: 1 } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });

        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: 'TRANSFER',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU-AUDIT', name: 'Audit', quantity: 2, cost: 500, productId: null }],
        }, '550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(true);
        expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('rechaza createPurchaseOrderSecure si la sesión no es válida', async () => {
        const UnauthorizedError = (await import('@/lib/pin-rbac')).PinRbacError as unknown as new (code?: string, message?: string) => Error;
        mockGetActorOrFail.mockRejectedValueOnce(new UnauthorizedError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'));

        const result = await supplyV2.createPurchaseOrderSecure({
            supplierId: '550e8400-e29b-41d4-a716-446655440000',
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU-SESSION', name: 'Test', quantity: 1, cost: 100, productId: null }],
        }, '550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
    });

    it('rechaza cancelPurchaseOrderSecure para roles fuera de aprobadores', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440003',
            role: 'WAREHOUSE',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            userName: 'Warehouse User',
            tokenVersion: 1,
            sessionToken: 'warehouse-session',
        });

        const result = await supplyV2.cancelPurchaseOrderSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            '550e8400-e29b-41d4-a716-446655440003',
            'Motivo de cancelación válido',
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('acota getSupplyChainHistorySecure a la ubicación efectiva del actor', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440004',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            userName: 'Manager Supply',
            tokenVersion: 1,
            sessionToken: 'manager-session',
        });

        mockDbQuery
            .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await supplyV2.getSupplyChainHistorySecure({
            type: 'PO',
            page: 1,
            pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(mockDbQuery.mock.calls[0]?.[1]).toContain('550e8400-e29b-41d4-a716-446655440099');
    });

    it('rechaza receivePurchaseOrderSecure cuando la orden está fuera del scope del actor', async () => {
        mockGetActorOrFail.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            userName: 'Manager Supply',
            tokenVersion: 1,
            sessionToken: 'manager-session',
        });

        const clientQuery = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE NOWAIT')) {
                return {
                    rows: [{
                        id: '550e8400-e29b-41d4-a716-446655440902',
                        status: 'APPROVED',
                        total_amount: 1000,
                    }],
                    rowCount: 1,
                } as const;
            }
            if (sql.includes('FROM purchase_orders po') && sql.includes('LEFT JOIN warehouses')) {
                return {
                    rows: [{
                        id: '550e8400-e29b-41d4-a716-446655440902',
                        status: 'APPROVED',
                        location_id: '550e8400-e29b-41d4-a716-446655440123',
                    }],
                    rowCount: 1,
                } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });

        const result = await supplyV2.receivePurchaseOrderSecure(
            { purchaseOrderId: '550e8400-e29b-41d4-a716-446655440902' },
            '550e8400-e29b-41d4-a716-446655440002',
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('rechaza updatePurchaseOrderSecure si supplier_id no existe', async () => {
        const orderId = '550e8400-e29b-41d4-a716-446655440902';
        const missingSupplierId = '550e8400-e29b-41d4-a716-446655440111';

        const clientQuery = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 } as const;
            }
            if (sql.includes('FROM purchase_orders po') && sql.includes('LEFT JOIN warehouses')) {
                return {
                    rows: [{
                        id: orderId,
                        status: 'DRAFT',
                        notes: '',
                        location_id: '550e8400-e29b-41d4-a716-446655440099',
                    }],
                    rowCount: 1,
                } as const;
            }
            if (sql.includes('SELECT id FROM suppliers WHERE id = $1')) {
                return { rows: [], rowCount: 0 } as const;
            }
            return { rows: [], rowCount: 0 } as const;
        });

        mockPoolConnect.mockResolvedValue({
            query: clientQuery,
            release: vi.fn(),
        });

        const result = await supplyV2.updatePurchaseOrderSecure(orderId, {
            supplierId: missingSupplierId,
            targetWarehouseId: '550e8400-e29b-41d4-a716-446655440001',
            items: [{ sku: 'SKU-MISSING-SUP', name: 'Item', quantity: 1, cost: 100, productId: null }],
        }, '550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Proveedor no encontrado');
        expect(clientQuery).toHaveBeenCalledWith('SELECT id FROM suppliers WHERE id = $1', [missingSupplierId]);
        expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE purchase_orders'))).toBe(false);
    });

    it('devuelve payload vacío para IDs temporales en getHistoryItemDetailsSecure', async () => {
        const result = await supplyV2.getHistoryItemDetailsSecure('PO-AUTO-777', 'PO');

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(mockDbQuery).not.toHaveBeenCalled();
    });
});
