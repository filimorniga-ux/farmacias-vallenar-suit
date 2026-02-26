/**
 * Tests for Shift-Handover V2 - Secure Shift Operations
 * 
 * Covers:
 * - Handover calculation
 * - Execute handover with PIN validation
 * - Quick handover between cashiers
 * - Error handling (locks, invalid PINs)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =====================================================
// TEST SETUP
// =====================================================

const mockQuery = vi.fn();
const mockDirectQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockBcryptCompare = vi.fn();

// Mock DB
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
    query: (...args: unknown[]) => mockDirectQuery(...args),
}));

// Mock uuid
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-1234',
}));

// Mock next/cache
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
}));

// Mock notifications
// Mock auth-v2 from the correct relative path
vi.mock('@/actions/auth-v2', () => ({
    validateSupervisorPin: vi.fn().mockResolvedValue({
        success: true,
        authorizedBy: { id: 'sup-1', name: 'Supervisor', role: 'MANAGER' }
    }),
}));

// Import after mocks
import {
    calculateHandoverSecure,
    executeHandoverSecure,
    quickHandoverSecure,
} from '@/actions/shift-handover-v2';
import { validateSupervisorPin } from '@/actions/auth-v2';

// Hardcoded constant (cannot export from 'use server' files)
const BASE_CASH = 50000;

// =====================================================
// TEST DATA
// =====================================================

const VALID_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
const VALID_LOCATION_ID = '123e4567-e89b-12d3-a456-426614174002';
const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174003';
const OUTGOING_USER_ID = 'user-outgoing';
const INCOMING_USER_ID = '123e4567-e89b-12d3-a456-426614174004';
const VALID_PIN = '1234';

// =====================================================
// TESTS: calculateHandoverSecure
// =====================================================

describe('calculateHandoverSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDirectQuery.mockReset();
    });

    it('should fail with invalid terminal ID', async () => {
        const result = await calculateHandoverSecure('invalid-uuid', 100000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ID inválido');
    });

    it('should fail with negative declared cash', async () => {
        const result = await calculateHandoverSecure(VALID_TERMINAL_ID, -1000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('positivo');
    });

    it('should keep full declared cash as carryover (no automatic remittance)', async () => {
        mockDirectQuery
            .mockResolvedValueOnce({
                rows: [{ id: VALID_SESSION_ID, opening_amount: 100000, opened_at: new Date() }],
                rowCount: 1,
            }) // Active session
            .mockResolvedValueOnce({
                rows: [{ payment_method: 'CASH', total: 1400000 }],
                rowCount: 1,
            }) // Sales
            .mockResolvedValueOnce({
                rows: [{ has_refunds: true }],
                rowCount: 1,
            }) // refunds table exists
            .mockResolvedValueOnce({
                rows: [{ total: 0 }],
                rowCount: 1,
            }) // cash refunds for session
            .mockResolvedValueOnce({
                rows: [{ total_in: 0, total_out: 0 }],
                rowCount: 1,
            }); // Movements

        const result = await calculateHandoverSecure(VALID_TERMINAL_ID, 1500000);

        expect(result.success).toBe(true);
        expect(result.data?.amountToWithdraw).toBe(0);
        expect(result.data?.amountToKeep).toBe(1500000);
    });

    it('should descontar devoluciones cash del expectedCash', async () => {
        mockDirectQuery
            .mockResolvedValueOnce({
                rows: [{ id: VALID_SESSION_ID, opening_amount: 100000, opened_at: new Date() }],
                rowCount: 1,
            }) // Active session
            .mockResolvedValueOnce({
                rows: [{ payment_method: 'CASH', total: 200000 }],
                rowCount: 1,
            }) // Sales
            .mockResolvedValueOnce({
                rows: [{ has_refunds: true }],
                rowCount: 1,
            }) // refunds table exists
            .mockResolvedValueOnce({
                rows: [{ total: 50000 }],
                rowCount: 1,
            }) // cash refunds
            .mockResolvedValueOnce({
                rows: [{ total_in: 0, total_out: 0 }],
                rowCount: 1,
            }); // Movements

        const result = await calculateHandoverSecure(VALID_TERMINAL_ID, 250000);

        expect(result.success).toBe(true);
        expect(result.data?.cashSales).toBe(150000);
        expect(result.data?.expectedCash).toBe(250000);
    });
});

// =====================================================
// TESTS: executeHandoverSecure
// =====================================================

describe('executeHandoverSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockReset();
        mockBcryptCompare.mockResolvedValue(true);
        vi.mocked(validateSupervisorPin).mockResolvedValue({
            success: true,
            authorizedBy: { id: 'sup-1', name: 'Supervisor', role: 'MANAGER' }
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should fail with invalid terminal ID', async () => {
        const result = await executeHandoverSecure({
            terminalId: 'invalid',
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: VALID_PIN,
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should require user PIN', async () => {
        const result = await executeHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: '12', // Too short
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should validate PIN before handover', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // PIN validation - no user found
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await executeHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: VALID_PIN,
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('incorrecto');
    });

    it('should execute handover with valid PIN', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') return Promise.resolve({ rows: [] });
            if (sql.includes('SELECT id, name, role, access_pin_hash, access_pin') && sql.includes('FROM users')) {
                return Promise.resolve({ rows: [{ id: OUTGOING_USER_ID, name: 'Cajero Test', role: 'CASHIER', access_pin_hash: 'hashed' }] });
            }
            if (sql.includes('SELECT id, location_id, current_cashier_id, status') && sql.includes('FROM terminals')) {
                return Promise.resolve({ rows: [{ id: VALID_TERMINAL_ID, location_id: VALID_LOCATION_ID, current_cashier_id: OUTGOING_USER_ID, status: 'OPEN' }] });
            }
            if (sql.includes('SELECT id, user_id, opening_amount, opened_at') && sql.includes('FROM cash_register_sessions')) {
                return Promise.resolve({ rows: [{ id: VALID_SESSION_ID, user_id: OUTGOING_USER_ID, opening_amount: 50000, opened_at: new Date() }] });
            }
            if (sql.includes('SELECT name FROM users WHERE id = $1 LIMIT 1')) {
                return Promise.resolve({ rows: [{ name: 'Cajero Test' }] });
            }
            if (sql.includes('UPDATE cash_register_sessions')) {
                return Promise.resolve({ rows: [{ id: VALID_SESSION_ID }], rowCount: 1 });
            }
            if (sql.includes('UPDATE terminals')) {
                return Promise.resolve({ rows: [], rowCount: 1 });
            }
            if (sql.includes('INSERT INTO audit_log')) {
                return Promise.resolve({ rows: [] });
            }
            if (sql === 'COMMIT') return Promise.resolve({ rows: [] });
            return Promise.resolve({ rows: [] });
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await executeHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: VALID_PIN,
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(result.remittanceId).toBeUndefined();
        const executedSql = mockQuery.mock.calls.map(([sql]) => String(sql));
        expect(executedSql.some((sql) => sql.includes('INSERT INTO treasury_remittances'))).toBe(false);
    });

    it('should fail if terminal not found', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: OUTGOING_USER_ID, name: 'Cajero', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // PIN
            { rows: [] }, // Terminal not found
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await executeHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: VALID_PIN,
            supervisorPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terminal');
    });
});

// =====================================================
// TESTS: quickHandoverSecure
// =====================================================

describe('quickHandoverSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should require both user PINs', async () => {
        const result = await quickHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            outgoingUserId: OUTGOING_USER_ID,
            outgoingUserPin: '12', // Too short
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: VALID_PIN,
            declaredCash: 150000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('saliente');
    });

    it('should validate outgoing user PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // Outgoing PIN validation - no user
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await quickHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            outgoingUserId: OUTGOING_USER_ID,
            outgoingUserPin: VALID_PIN,
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: VALID_PIN,
            declaredCash: 150000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('saliente');
    });

    it('should validate incoming user PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: OUTGOING_USER_ID, name: 'Outgoing', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // Outgoing PIN OK
            { rows: [] }, // Incoming PIN validation - no user
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await quickHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            outgoingUserId: OUTGOING_USER_ID,
            outgoingUserPin: VALID_PIN,
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: VALID_PIN,
            declaredCash: 150000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('entrante');
    });

    it('should complete quick handover with valid PINs', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: OUTGOING_USER_ID, name: 'Outgoing', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // Outgoing PIN
            { rows: [{ id: INCOMING_USER_ID, name: 'Incoming', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // Incoming PIN
            { rows: [{ id: VALID_TERMINAL_ID, location_id: VALID_LOCATION_ID, current_cashier_id: OUTGOING_USER_ID }] }, // Terminal lock
            { rows: [{ id: VALID_SESSION_ID, opening_amount: 50000, opened_at: new Date() }] }, // Session lock
            { rows: [], rowCount: 1 }, // Close session
            { rows: [] }, // Create new session
            { rows: [], rowCount: 1 }, // Update terminal
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await quickHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            outgoingUserId: OUTGOING_USER_ID,
            outgoingUserPin: VALID_PIN,
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: VALID_PIN,
            declaredCash: 150000,
        });

        expect(result.success).toBe(true);
        expect(result.newSessionId).toBeDefined();
    });

    it('should handle lock contention', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: OUTGOING_USER_ID, name: 'Outgoing', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // Outgoing PIN
            { rows: [{ id: INCOMING_USER_ID, name: 'Incoming', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // Incoming PIN
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            if (callIndex === 3) {
                // Simulate lock error on terminal
                const error = new Error('Lock not available') as Error & { code?: string };
                error.code = '55P03';
                throw error;
            }
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await quickHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            outgoingUserId: OUTGOING_USER_ID,
            outgoingUserPin: VALID_PIN,
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: VALID_PIN,
            declaredCash: 150000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('utilizada por otro proceso');
    });
});
