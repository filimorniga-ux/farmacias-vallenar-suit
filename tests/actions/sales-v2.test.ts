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

vi.mock('bcryptjs', () => ({
    compare: (...args: any[]) => mockBcryptCompare(...args),
}));

// Import after mocks
import { 
    createSaleSecure, 
    voidSaleSecure, 
    refundSaleSecure,
    getSalesHistory,
    getSessionSalesSummary
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

// =====================================================
// TESTS - createSaleSecure
// =====================================================

describe('Sales V2 - createSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
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
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session check
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

    it('should return stock errors when insufficient stock', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session check
            .mockResolvedValueOnce({ rows: [{ 
                id: validSaleParams.items[0].batch_id, 
                quantity_real: 1, // Only 1 available, but requesting 2
                sku: 'PARA-500' 
            }] }); // Stock check with insufficient quantity

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Stock insuficiente');
        expect(result.stockErrors).toBeDefined();
        expect(result.stockErrors?.length).toBeGreaterThan(0);
    });

    it('should handle lock errors gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session check
            .mockRejectedValueOnce({ code: '55P03' }); // Lock not available

        const result = await createSaleSecure(validSaleParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('bloqueado por otro proceso');
    });

    it('should handle serialization conflicts', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session check
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

describe('Sales V2 - voidSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
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
            .mockResolvedValueOnce({ rows: [{ 
                id: 'supervisor-1', 
                name: 'Admin', 
                role: 'ADMIN',
                access_pin_hash: 'hashed'
            }] }) // Supervisor found
            .mockResolvedValueOnce({ rows: [{ 
                id: validVoidParams.saleId,
                status: 'VOIDED', // Already voided
                total_amount: 5980
            }] }); // Sale check

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ya fue anulada');
    });

    it('should return error for non-existent sale', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ 
                id: 'supervisor-1', 
                name: 'Admin', 
                role: 'ADMIN',
                access_pin_hash: 'hashed'
            }] }) // Supervisor found
            .mockResolvedValueOnce({ rows: [] }); // Sale not found

        const result = await voidSaleSecure(validVoidParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('no encontrada');
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
            .mockResolvedValueOnce({ rows: [] }); // No supervisors

        const result = await refundSaleSecure(validRefundParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should prevent refund on voided sale', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ 
                id: 'supervisor-1', 
                name: 'Admin', 
                role: 'ADMIN',
                access_pin_hash: 'hashed'
            }] }) // Supervisor found
            .mockResolvedValueOnce({ rows: [{ 
                id: validRefundParams.saleId,
                status: 'VOIDED'
            }] }); // Voided sale

        const result = await refundSaleSecure(validRefundParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('anulada');
    });
});

// =====================================================
// TESTS - getSalesHistory
// =====================================================

describe('Sales V2 - getSalesHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should return paginated results', async () => {
        const { query } = await import('@/lib/db');
        (query as any)
            .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Count
            .mockResolvedValueOnce({ rows: [
                { id: 'sale-1', total_amount: 5000 },
                { id: 'sale-2', total_amount: 3000 }
            ] }); // Data

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
            .mockResolvedValueOnce({ rows: [{ 
                total_sales: '10',
                total_amount: '50000',
                voided_count: '1',
                refunded_sales_amount: '5000'
            }] })
            .mockResolvedValueOnce({ rows: [
                { payment_method: 'CASH', total: '30000' },
                { payment_method: 'DEBIT', total: '20000' }
            ] })
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
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should use FOR UPDATE NOWAIT for stock locking', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session
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
            .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] }) // Session
            .mockResolvedValueOnce({ rows: [{ 
                id: VALID_BATCH_ID,
                quantity_real: 100,
                sku: 'TEST'
            }] }) // Stock
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
