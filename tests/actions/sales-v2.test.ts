/**
 * Unit Tests - Sales V2 Module
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Tests for secure sales operations:
 * - createSaleSecure
 * - voidSaleSecure
 * - refundSaleSecure
 * - getSalesHistory
 * - getSessionSalesSummary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =====================================================
// TEST SETUP - Mocks defined before vi.mock
// =====================================================

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockBcryptCompare = vi.fn();
const mockGetValidatedSession = vi.fn();

// Mock DB - factory function doesn't reference external variables
vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
    },
    query: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('uuid', () => ({
    v4: vi.fn(() => 'test-uuid-12345'),
}));

vi.mock('@/lib/pin-rbac', () => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        PinRbacError: MockPinRbacError,
        ROLE_GROUPS: {
            ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
            MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
            MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
            OVERRIDE: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'],
            TREASURY_AUTH: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'TESORERO'],
        },
        getActorOrFail: async () => {
            const session = await mockGetValidatedSession();
            if (!session) {
                throw new MockPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.');
            }
            return {
                ...session,
                role: String(session.role || '').trim().toUpperCase(),
            };
        },
        validatePinForRoles: async (client: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }, pin: string) => {
            const usersRes = await client.query('SELECT mock_pin_validation');
            const user = usersRes.rows[0];
            if (!user) {
                return { valid: false, error: 'PIN inválido' };
            }

            if (user.access_pin_hash) {
                const valid = await mockBcryptCompare(pin, user.access_pin_hash);
                if (!valid) {
                    return { valid: false, error: 'PIN inválido' };
                }
            } else if (user.access_pin && user.access_pin !== pin) {
                return { valid: false, error: 'PIN inválido' };
            }

            return {
                valid: true,
                authorizedBy: {
                    id: String(user.id),
                    name: String(user.name),
                    role: String(user.role),
                },
                matchedBy: 'hash',
            };
        },
    };
});

// Import after mocks
import {
    createSaleSecure,
    voidSaleSecure,
    refundSaleSecure,
    editSaleSecure,
    getSalesHistorySecure,
    getSalesHistory,
    getSessionSalesSummary,
    getSaleDetailsSecure
} from '@/actions/sales-v2';

// =====================================================
// TEST DATA
// =====================================================

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const VALID_BATCH_ID = '550e8400-e29b-41d4-a716-446655440003';
const VALID_SALE_ID = '550e8400-e29b-41d4-a716-446655440004';
const VALID_SALE_ITEM_ID = '550e8400-e29b-41d4-a716-446655440005';
const VALID_USER_ID = 'user-123';

const ACTIVE_SESSION_ROW = {
    id: VALID_SESSION_ID,
    user_id: VALID_USER_ID,
    terminal_id: VALID_TERMINAL_ID,
    location_id: VALID_LOCATION_ID,
};

// =====================================================
// TESTS - createSaleSecure
// =====================================================

describe('Sales V2 - createSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin de Sesion',
            tokenVersion: 1,
            sessionToken: 'session-token-1',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const validSaleParams = {
        locationId: VALID_LOCATION_ID,
        terminalId: VALID_TERMINAL_ID,
        sessionId: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        items: [
            {
                batch_id: VALID_BATCH_ID,
                sku: 'PARA-500',
                name: 'Paracetamol 500mg',
                quantity: 2,
                price: 2990,
                discount: 0,
            }
        ],
        paymentMethod: 'CASH' as const,
        customerRut: '12345678-9',
    };

    it('should reject invalid input (missing required fields)', async () => {
        const result = await createSaleSecure({
            ...validSaleParams,
            locationId: 'not-a-uuid', // Invalid UUID
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ID inválido');
    });

    it('should reject sale creation when validated session is missing', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await createSaleSecure({
            ...validSaleParams,
            customerRut: undefined,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should reject empty items array', async () => {
        const result = await createSaleSecure({
            ...validSaleParams,
            items: [],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('al menos un ítem');
    });

    it('should reject invalid payment method', async () => {
        const result = await createSaleSecure({
            ...validSaleParams,
            paymentMethod: 'BITCOIN' as any,
        });

        expect(result.success).toBe(false);
        // Error comes from Zod validation
        expect(result.error).toMatch(/Invalid|inválido|CASH|DEBIT|CREDIT/i);
    });

    it('should reject negative quantity', async () => {
        const result = await createSaleSecure({
            ...validSaleParams,
            items: [{
                batch_id: VALID_BATCH_ID,
                quantity: -5,
                price: 2990,
            }],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('positiva');
    });

    it('should use SERIALIZABLE isolation level', async () => {
        // Setup mocks for successful flow
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session check
            .mockResolvedValueOnce({ rows: [{ id: validSaleParams.items[0].batch_id, quantity_real: 100, sku: 'PARA-500' }] }) // Stock check
            .mockResolvedValueOnce({}) // Insert sale
            .mockResolvedValueOnce({}) // Insert item
            .mockResolvedValueOnce({}) // Update stock
            .mockResolvedValueOnce({}) // Update customer points
            .mockResolvedValueOnce({}) // Update customer points earned
            .mockResolvedValueOnce({}) // Audit log
            .mockResolvedValueOnce({}); // COMMIT

        await createSaleSecure(validSaleParams);

        // Check that BEGIN was called with SERIALIZABLE
        expect(mockQuery).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL SERIALIZABLE');
    });

    it('should check for active session before processing', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }); // No active session

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('sesión de caja activa');
    });

    it('should reject sale creation when cash session belongs to another user', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    ...ACTIVE_SESSION_ROW,
                    user_id: 'another-user',
                }],
            });

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('otro usuario');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject sale creation when cash session location mismatches payload location', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    ...ACTIVE_SESSION_ROW,
                    location_id: '550e8400-e29b-41d4-a716-446655440099',
                }],
            });

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación seleccionada');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should allow sale with insufficient stock (negative inventory)', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session check
            .mockResolvedValueOnce({
                rows: [{
                    id: validSaleParams.items[0].batch_id,
                    quantity_real: 1, // Only 1 available, but requesting 2
                    sku: 'PARA-500'
                }]
            }) // Stock check with insufficient quantity
            .mockResolvedValueOnce({}) // Insert sale
            .mockResolvedValueOnce({}) // Insert item
            .mockResolvedValueOnce({}) // Update stock (goes to -1)
            .mockResolvedValueOnce({}) // Update customer points
            .mockResolvedValueOnce({}) // Update customer points earned
            // .mockResolvedValueOnce({}) // Notification check query (inside IIFE, might not be awaited in test flow)
            // Audit log mock is next in main flow
            .mockResolvedValueOnce({}) // Audit log
            .mockResolvedValueOnce({}); // COMMIT

        const result = await createSaleSecure(validSaleParams);

        // Expect SUCCESS (Negative stock allowed)
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        expect(result.stockErrors).toBeUndefined();
    });

    it('should use validated session user for sale persistence and audit instead of payload userId', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'session-user-999',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Actor Real',
            tokenVersion: 2,
            sessionToken: 'session-token-actor',
        });

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    ...ACTIVE_SESSION_ROW,
                    user_id: 'session-user-999',
                }],
            }) // Session check
            .mockResolvedValueOnce({
                rows: [{
                    id: validSaleParams.items[0].batch_id,
                    quantity_real: 100,
                    sku: 'PARA-500',
                }]
            }) // Stock check
            .mockResolvedValueOnce({}) // Insert sale
            .mockResolvedValueOnce({}) // Insert item
            .mockResolvedValueOnce({}) // Update stock
            .mockResolvedValueOnce({}) // Update customer points
            .mockResolvedValueOnce({}) // Audit log
            .mockResolvedValueOnce({}); // COMMIT

        const result = await createSaleSecure({
            ...validSaleParams,
            userId: 'payload-user-legacy',
            customerRut: undefined,
        });

        expect(result.success).toBe(true);

        const saleInsertCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO sales')
        );
        expect(saleInsertCall?.[1]?.[4]).toBe('session-user-999');

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe('session-user-999');
    });

    it('should persist sales using the runtime sales and sale_items schema', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session check
            .mockResolvedValueOnce({
                rows: [{
                    id: validSaleParams.items[0].batch_id,
                    quantity_real: 100,
                    sku: 'PARA-500',
                }]
            }) // Stock check
            .mockResolvedValueOnce({}) // Insert sale
            .mockResolvedValueOnce({}) // Insert item
            .mockResolvedValueOnce({}) // Update stock
            .mockResolvedValueOnce({}) // Audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await createSaleSecure({
            ...validSaleParams,
            customerRut: undefined,
        });

        expect(result.success).toBe(true);

        const saleInsertCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO sales')
        );
        const saleInsertSql = String(saleInsertCall?.[0] || '');
        expect(saleInsertSql).toContain('customer_rut, total, total_amount, payment_method');
        expect(saleInsertSql).not.toContain('customer_name');
        expect(saleInsertSql).not.toContain('subtotal');
        expect(saleInsertSql).not.toContain('discount_amount');
        expect(saleInsertSql).not.toContain('dte_type');
        expect(saleInsertSql).not.toContain('queue_ticket_id');

        const saleItemInsertCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO sale_items')
        );
        const saleItemInsertSql = String(saleItemInsertCall?.[0] || '');
        expect(saleItemInsertSql).toContain('unit_price, total_price');
        expect(saleItemInsertSql).not.toContain('discount_amount');
        expect(saleItemInsertSql).not.toContain('product_name');
        expect(saleItemInsertSql).not.toContain('timestamp');
    });

    it('should handle lock errors gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session check
            .mockRejectedValueOnce({ code: '55P03' }); // Lock not available

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('bloqueado por otro proceso');
    });

    it('should handle serialization conflicts', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session check
            .mockRejectedValueOnce({ code: '40001' }); // Serialization failure

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('concurrencia');
    });

    it('should rollback on any error', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockRejectedValueOnce(new Error('Database error'));

        await createSaleSecure(validSaleParams);

        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should always release client connection', async () => {
        mockQuery.mockRejectedValueOnce(new Error('Any error'));

        await createSaleSecure(validSaleParams);

        expect(mockRelease).toHaveBeenCalled();
    });
});

// =====================================================
// TESTS - voidSaleSecure
// =====================================================

describe('Sales V2 - getSaleDetailsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('returns immutable audit history for edits and voids', async () => {
        const createdAt = new Date('2026-05-18T16:00:00.000Z');

        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_SALE_ID,
                    timestamp: createdAt,
                    status: 'VOIDED',
                    total_amount: 12000,
                    payment_method: 'CASH',
                    customer_rut: null,
                    customer_name: null,
                    dte_folio: null,
                    notes: null,
                    queue_ticket_id: null,
                    edited_at: null,
                    edit_reason: null,
                    edit_authorized_by: null,
                    seller_name: 'Cajero Test',
                    edit_authorized_name: null,
                    customer_email: null,
                    customer_phone: null,
                }]
            }) // Sale header
            .mockResolvedValueOnce({ rows: [] }) // Items
            .mockResolvedValueOnce({ rows: [] }) // Refunds
            .mockResolvedValueOnce({
                rows: [{
                    id: 'audit-1',
                    created_at: createdAt,
                    action_code: 'SALE_VOID',
                    justification: 'Cliente solicitó anular la venta por error de caja',
                    old_values: { status: 'COMPLETED' },
                    new_values: {
                        status: 'VOIDED',
                        void_reason: 'Cliente solicitó anular la venta por error de caja',
                        authorized_by: 'supervisor-1',
                    },
                    user_name: 'Cajero Test',
                    authorized_by_name: 'Supervisor Test',
                }]
            }); // Audit history

        const result = await getSaleDetailsSecure(VALID_SALE_ID);

        expect(result?.audit_history).toHaveLength(1);
        expect(result?.audit_history?.[0]).toMatchObject({
            action_code: 'SALE_VOID',
            authorized_by_name: 'Supervisor Test',
        });

        const auditQuery = mockQuery.mock.calls[3]?.[0];
        expect(String(auditQuery)).toContain('SALE_EDIT');
        expect(String(auditQuery)).toContain('SALE_VOID');
        expect(String(auditQuery)).toContain("al.new_values->>'original_sale_id'");
    });
});

describe('Sales V2 - voidSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin de Sesion',
            tokenVersion: 1,
            sessionToken: 'session-token-void',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const validVoidParams = {
        saleId: VALID_SALE_ID,
        userId: VALID_USER_ID,
        reason: 'Cliente cambió de opinión sobre la compra',
        supervisorPin: '1234',
    };

    it('should reject short justification', async () => {
        const result = await voidSaleSecure({
            ...validVoidParams,
            reason: 'short', // Less than 10 chars
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });

    it('should require supervisor PIN', async () => {
        const result = await voidSaleSecure({
            ...validVoidParams,
            supervisorPin: '12', // Too short
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should validate PIN with bcrypt', async () => {
        mockBcryptCompare.mockResolvedValue(false);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }); // No supervisors found

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should prevent voiding already voided sale', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed'
                }]
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validVoidParams.saleId,
                    status: 'VOIDED', // Already voided
                    total_amount: 5980
                }]
            }); // Sale check

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ya fue anulada');
    });

    it('should return error for non-existent sale', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed'
                }]
            }) // Supervisor found
            .mockResolvedValueOnce({ rows: [] }); // Sale not found

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('no encontrada');
    });

    it('should reject voidSaleSecure when validated session is missing', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should use validated session user for void persistence and audit instead of payload userId', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'session-user-void',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Actor Void',
            tokenVersion: 2,
            sessionToken: 'session-token-void-2',
        });

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed',
                }],
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validVoidParams.saleId,
                    status: 'COMPLETED',
                    total_amount: 5980,
                    location_id: VALID_LOCATION_ID,
                    terminal_id: VALID_TERMINAL_ID,
                    session_id: VALID_SESSION_ID,
                }],
            }) // Sale
            .mockResolvedValueOnce({ rows: [] }) // Sale items
            .mockResolvedValueOnce({ rows: [] }) // Update sale
            .mockResolvedValueOnce({ rows: [] }) // Audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await voidSaleSecure({
            ...validVoidParams,
            userId: 'payload-user-void',
        });

        expect(result.success).toBe(true);

        const updateSaleCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes("SET status = 'VOIDED'")
        );
        expect(updateSaleCall?.[1]?.[0]).toBe(validVoidParams.saleId);

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe('session-user-void');
        expect(JSON.parse(String(auditCall?.[1]?.[7]))).toMatchObject({
            authorized_by: 'supervisor-1',
        });
    });
});

// =====================================================
// TESTS - refundSaleSecure
// =====================================================

describe('Sales V2 - refundSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin de Sesion',
            tokenVersion: 1,
            sessionToken: 'session-token-refund',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const validRefundParams = {
        saleId: VALID_SALE_ID,
        userId: VALID_USER_ID,
        items: [{
            saleItemId: VALID_SALE_ITEM_ID,
            quantity: 1,
        }],
        reason: 'Producto defectuoso - cliente solicita devolución',
        supervisorPin: '1234',
    };

    it('should validate refund input', async () => {
        const result = await refundSaleSecure({
            ...validRefundParams,
            items: [], // Empty items
        });

        expect(result.success).toBe(false);
    });

    it('should require supervisor authorization', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ has_refunds: false, has_refund_items: false }] }) // Table check
            .mockResolvedValueOnce({ rows: [] }); // No supervisors

        const result = await refundSaleSecure(validRefundParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should prevent refund on voided sale', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ has_refunds: false, has_refund_items: false }] }) // Table check
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed'
                }]
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validRefundParams.saleId,
                    status: 'VOIDED'
                }]
            }); // Voided sale

        const result = await refundSaleSecure(validRefundParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('anulada');
    });

    it('should create refund ledger with selected refund method and ticket number', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ has_refunds: true, has_refund_items: true }] }) // Table check
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed'
                }]
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validRefundParams.saleId,
                    status: 'COMPLETED',
                    location_id: VALID_LOCATION_ID,
                    terminal_id: VALID_TERMINAL_ID,
                    session_id: VALID_SESSION_ID,
                    payment_method: 'CASH',
                    total_amount: 3000
                }]
            }) // Sale
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_SALE_ITEM_ID,
                    sale_id: VALID_SALE_ID,
                    batch_id: VALID_BATCH_ID,
                    quantity: 2,
                    refunded_quantity: 0,
                    unit_price: 1500,
                    product_name: 'Paracetamol'
                }]
            }) // Sale item FOR UPDATE
            .mockResolvedValueOnce({ rows: [] }) // Update sale_items refunded_quantity
            .mockResolvedValueOnce({ rows: [] }) // Update inventory_batches
            .mockResolvedValueOnce({ rows: [] }) // Insert refunds
            .mockResolvedValueOnce({ rows: [] }) // Insert refund_items
            .mockResolvedValueOnce({ rows: [{ remaining: '1' }] }) // Remaining qty
            .mockResolvedValueOnce({ rows: [] }) // Update sale status partial
            .mockResolvedValueOnce({ rows: [] }) // Audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await refundSaleSecure({
            ...validRefundParams,
            refundMethod: 'TRANSFER',
        });

        expect(result.success).toBe(true);
        expect(result.refundAmount).toBe(1500);
        expect(result.ticketNumber).toMatch(/^REF-\d{8}-/);

        const insertRefundCall = mockQuery.mock.calls.find(
            (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO refunds')
        );
        expect(insertRefundCall).toBeDefined();
        if (!insertRefundCall) return;
        expect(insertRefundCall[1]).toEqual(expect.arrayContaining(['TRANSFER']));
    });

    it('should reject refundSaleSecure when validated session is missing', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await refundSaleSecure(validRefundParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should use validated session user for refund persistence and audit instead of payload userId', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'session-user-refund',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Actor Refund',
            tokenVersion: 2,
            sessionToken: 'session-token-refund-2',
        });

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ has_refunds: true, has_refund_items: true }] }) // Table check
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed',
                }],
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validRefundParams.saleId,
                    status: 'COMPLETED',
                    location_id: VALID_LOCATION_ID,
                    terminal_id: VALID_TERMINAL_ID,
                    session_id: VALID_SESSION_ID,
                    payment_method: 'CASH',
                    total_amount: 3000,
                }],
            }) // Sale
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_SALE_ITEM_ID,
                    sale_id: VALID_SALE_ID,
                    batch_id: VALID_BATCH_ID,
                    quantity: 2,
                    refunded_quantity: 0,
                    unit_price: 1500,
                    product_name: 'Paracetamol',
                }],
            }) // Sale item
            .mockResolvedValueOnce({ rows: [] }) // Update sale_items
            .mockResolvedValueOnce({ rows: [] }) // Update inventory_batches
            .mockResolvedValueOnce({ rows: [] }) // Insert refunds
            .mockResolvedValueOnce({ rows: [] }) // Insert refund_items
            .mockResolvedValueOnce({ rows: [{ remaining: '1' }] }) // Remaining qty
            .mockResolvedValueOnce({ rows: [] }) // Update sale status
            .mockResolvedValueOnce({ rows: [] }) // Audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await refundSaleSecure({
            ...validRefundParams,
            userId: 'payload-user-refund',
            refundMethod: 'TRANSFER',
        });

        expect(result.success).toBe(true);

        const insertRefundCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO refunds')
        );
        expect(insertRefundCall?.[1]?.[2]).toBe('session-user-refund');

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe('session-user-refund');
    });
});

describe('Sales V2 - editSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin de Sesion',
            tokenVersion: 1,
            sessionToken: 'session-token-edit',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const validEditParams = {
        saleId: VALID_SALE_ID,
        userId: VALID_USER_ID,
        supervisorPin: '1234',
        reason: 'Corrección de ítems por error de digitación',
        items: [
            {
                name: 'Producto manual',
                quantity: 1,
                price: 2500,
            },
        ],
    };

    it('should reject editSaleSecure when validated session is missing', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await editSaleSecure(validEditParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should use validated session user for sale edit persistence and audit instead of payload userId', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'session-user-edit',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Actor Edit',
            tokenVersion: 2,
            sessionToken: 'session-token-edit-2',
        });

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: 'supervisor-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed',
                }],
            }) // Supervisor found
            .mockResolvedValueOnce({
                rows: [{
                    id: validEditParams.saleId,
                    status: 'COMPLETED',
                    total_amount: 1800,
                    location_id: VALID_LOCATION_ID,
                    terminal_id: VALID_TERMINAL_ID,
                    session_id: VALID_SESSION_ID,
                    dte_folio: null,
                }],
            }) // Sale
            .mockResolvedValueOnce({ rows: [] }) // Original items
            .mockResolvedValueOnce({ rows: [] }) // Delete sale_items
            .mockResolvedValueOnce({ rows: [] }) // Insert sale_item
            .mockResolvedValueOnce({ rows: [] }) // Update sale
            .mockResolvedValueOnce({ rows: [] }) // Audit
            .mockResolvedValueOnce({}); // COMMIT

        const result = await editSaleSecure({
            ...validEditParams,
            userId: 'payload-user-edit',
        });

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(2500);

        const updateSaleCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('SET total_amount')
        );
        expect(updateSaleCall?.[1]?.[2]).toBe(validEditParams.saleId);

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe('session-user-edit');
    });
});

// =====================================================
// TESTS - getSalesHistory
// =====================================================

describe('Sales V2 - getSalesHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin Historial',
            tokenVersion: 1,
            sessionToken: 'session-token-history',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should return paginated results', async () => {
        const { query } = await import('@/lib/db');
        (query as any)
            .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Count
            .mockResolvedValueOnce({
                rows: [
                    { id: 'sale-1', total_amount: 5000 },
                    { id: 'sale-2', total_amount: 3000 }
                ]
            }); // Data

        const result = await getSalesHistory({ limit: 10, offset: 0 });

        expect(result.success).toBe(true);
        expect(result.total).toBe(25);
        expect(result.data?.length).toBe(2);
    });

    it('should filter by location', async () => {
        const { query } = await import('@/lib/db');
        (query as any)
            .mockResolvedValueOnce({ rows: [{ count: '5' }] })
            .mockResolvedValueOnce({ rows: [] });

        await getSalesHistory({
            locationId: VALID_LOCATION_ID
        });

        // Check that location filter was applied
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('location_id'),
            expect.arrayContaining([VALID_LOCATION_ID])
        );
    });

    it('should handle database errors gracefully', async () => {
        const { query } = await import('@/lib/db');
        (query as any).mockRejectedValueOnce(new Error('DB Error'));

        const result = await getSalesHistory({});

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should query sales history without legacy sales columns', async () => {
        const { query } = await import('@/lib/db');
        (query as any)
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getSalesHistorySecure({
            filters: {
                startDate: '2026-05-18',
                endDate: '2026-05-18',
                searchTerm: 'cliente',
                limit: 10,
                offset: 0,
            },
            security: {
                locationId: VALID_LOCATION_ID,
            },
        });

        expect(result.success).toBe(true);
        const allSql = (query as any).mock.calls.map((call: [unknown]) => String(call[0])).join('\n');
        expect(allSql).toContain('LEFT JOIN customers c');
        expect(allSql).toContain('c.name as customer_name');
        expect(allSql).not.toContain('s.customer_name');
        expect(allSql).not.toContain('s.dte_type');
        expect(allSql).not.toContain('s.edited_at');
        expect(allSql).not.toContain('s.edit_reason');
        expect(allSql).not.toContain('s.edit_authorized_by');
    });
});

// =====================================================
// TESTS - getSessionSalesSummary
// =====================================================

describe('Sales V2 - getSessionSalesSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should reject invalid session ID', async () => {
        const result = await getSessionSalesSummary('not-a-uuid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should return summary with sales by payment method', async () => {
        const { query } = await import('@/lib/db');
        (query as any)
            .mockResolvedValueOnce({
                rows: [{
                    total_sales: '10',
                    total_amount: '50000',
                    voided_count: '1',
                    refunded_sales_amount: '5000'
                }]
            })
            .mockResolvedValueOnce({
                rows: [
                    { payment_method: 'CASH', total: '30000' },
                    { payment_method: 'DEBIT', total: '20000' }
                ]
            })
            .mockResolvedValueOnce({ rows: [{ refunded_amount: '2500' }] });

        const result = await getSessionSalesSummary(VALID_SESSION_ID);

        expect(result.success).toBe(true);
        expect(result.data?.totalSales).toBe(10);
        expect(result.data?.totalAmount).toBe(50000);
        expect(result.data?.salesByMethod['CASH']).toBe(30000);
        expect(result.data?.salesByMethod['DEBIT']).toBe(20000);
    });
});

// =====================================================
// TESTS - Security Features
// =====================================================

describe('Sales V2 - Security Features', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockGetValidatedSession.mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin Seguridad',
            tokenVersion: 1,
            sessionToken: 'session-token-security',
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should use FOR UPDATE NOWAIT for stock locking', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session
            .mockResolvedValueOnce({ rows: [] }); // Stock query

        await createSaleSecure({
            locationId: VALID_LOCATION_ID,
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            userId: VALID_USER_ID,
            items: [{
                batch_id: VALID_BATCH_ID,
                quantity: 1,
                price: 1000,
            }],
            paymentMethod: 'CASH',
        });

        // Verify FOR UPDATE NOWAIT was used
        const stockQuery = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('FOR UPDATE NOWAIT')
        );
        expect(stockQuery).toBeDefined();
    });

    it('should insert audit log for sales', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [ACTIVE_SESSION_ROW] }) // Session
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_BATCH_ID,
                    quantity_real: 100,
                    sku: 'TEST'
                }]
            }) // Stock
            .mockResolvedValueOnce({}) // Insert sale
            .mockResolvedValueOnce({}) // Insert item
            .mockResolvedValueOnce({}) // Update stock
            .mockResolvedValueOnce({}) // Audit - this is what we check
            .mockResolvedValueOnce({}); // COMMIT

        await createSaleSecure({
            locationId: VALID_LOCATION_ID,
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            userId: VALID_USER_ID,
            items: [{
                batch_id: VALID_BATCH_ID,
                quantity: 1,
                price: 1000,
            }],
            paymentMethod: 'CASH',
        });

        // Check that audit_log INSERT was called
        const auditQuery = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('audit_log')
        );
        expect(auditQuery).toBeDefined();
    });
});
