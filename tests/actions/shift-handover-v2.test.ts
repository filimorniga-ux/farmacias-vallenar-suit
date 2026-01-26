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
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
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
    compare: (...args: any[]) => mockBcryptCompare(...args),
}));

// Mock notifications
vi.mock('./notifications', () => ({
    notifyManagers: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import {
    calculateHandoverSecure,
    executeHandoverSecure,
    quickHandoverSecure,
} from '@/actions/shift-handover-v2';

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
    });

    it('should fail with invalid terminal ID', async () => {
        const result = await calculateHandoverSecure('invalid-uuid', 100000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should fail with negative declared cash', async () => {
        const result = await calculateHandoverSecure(VALID_TERMINAL_ID, -1000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('positivo');
    });
});

// =====================================================
// TESTS: executeHandoverSecure
// =====================================================

describe('executeHandoverSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
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
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should execute handover with valid PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: OUTGOING_USER_ID, name: 'Cajero Test', role: 'CASHIER', access_pin_hash: 'hashed' }] }, // PIN validation
            { rows: [{ role: 'CASHIER' }] }, // Role check
            { rows: [{ id: VALID_TERMINAL_ID, location_id: VALID_LOCATION_ID, current_cashier_id: OUTGOING_USER_ID, status: 'OPEN' }] }, // Terminal lock
            { rows: [{ id: VALID_SESSION_ID, user_id: OUTGOING_USER_ID, opening_amount: 50000, opened_at: new Date() }] }, // Session lock
            { rows: [] }, // Insert remittance
            { rows: [], rowCount: 1 }, // Update session
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

        const result = await executeHandoverSecure({
            terminalId: VALID_TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: BASE_CASH,
            userId: OUTGOING_USER_ID,
            userPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(result.remittanceId).toBeDefined();
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
                const error: any = new Error('Lock not available');
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
