/**
 * Tests for Treasury V2 - Secure Financial Operations
 * 
 * Covers:
 * - Secure fund transfers with authorization
 * - Bank deposits with PIN validation
 * - Remittance confirmation
 * - Cash movements with thresholds
 * - Validation and error handling
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
    query: vi.fn(),
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

// Mock rate-limiter
vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: vi.fn(() => ({ allowed: true })),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn(),
}));

// Mock auth-v2
// Mock auth-v2 - Remove this to rely on real logic with mocked headers
// vi.mock('@/actions/auth-v2', () => ({
//    getSessionSecure: vi.fn().mockResolvedValue({ userId: 'user-123', role: 'MANAGER' })
// }));

// Mock next/headers for getSessionSecure
vi.mock('next/headers', () => ({
    headers: vi.fn(),
    cookies: vi.fn(() => ({
        get: (name: string) => {
            if (name === 'user_id') return { value: 'user-123' };
            if (name === 'user_role') return { value: 'MANAGER' };
            return undefined;
        }
    }))
}));

// Mock simple db query for session check inside getSessionSecure
// We need to intercept the session query in getSessionSecure if it hits the DB.
// But auth-v2 might decode the token directly. 
// Assuming getSessionSecure uses cookies() -> decode/validate.
// If it queries DB 'sessions' table, we need to mock that too.
// Let's assume standard session validation queries the DB or uses JWT.
// Given strict session, it likely checks DB. 
// I will ensure the DB mock handles the session query if it occurs.

// Import after mocks
import {
    transferFundsSecure,
    depositToBankSecure,
    confirmRemittanceSecure,
    createCashMovementSecure,
} from '@/actions/treasury-v2';

// Hardcoded thresholds (cannot export from 'use server' files)
const AUTHORIZATION_THRESHOLDS = {
    TRANSFER: 500000,
    DEPOSIT: 1000000,
    WITHDRAWAL: 100000,
} as const;

// =====================================================
// TEST DATA
// =====================================================

const VALID_SAFE_ID = '123e4567-e89b-12d3-a456-426614174001';
const VALID_BANK_ID = '123e4567-e89b-12d3-a456-426614174002';
const VALID_USER_ID = 'user-123';
const VALID_MANAGER_ID = 'user-123';
const VALID_PIN = '1234';
const VALID_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174003';
const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174004';
const VALID_REMITTANCE_ID = '123e4567-e89b-12d3-a456-426614174005';

// =====================================================
// TESTS
// =====================================================

describe('transferFundsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should transfer funds successfully without authorization (under threshold)', async () => {
        // Setup: Sequential mock responses
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [ // Account lock query - both accounts
                    { id: VALID_SAFE_ID, name: 'Caja Fuerte', type: 'SAFE', balance: 1000000, location_id: 'loc-1', is_active: true },
                    { id: VALID_BANK_ID, name: 'Banco', type: 'BANK', balance: 500000, location_id: 'loc-1', is_active: true },
                ]
            },
            { rows: [], rowCount: 1 }, // Update source balance
            { rows: [] }, // Insert OUT transaction
            { rows: [], rowCount: 1 }, // Update dest balance
            { rows: [] }, // Insert IN transaction
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: 100000, // Under threshold, no auth needed
            description: 'Test transfer',
        });

        expect(result.success).toBe(true);
        expect(result.transferId).toBeDefined();
    });

    it('should require authorization for amounts above threshold', async () => {
        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: AUTHORIZATION_THRESHOLDS.TRANSFER + 1, // Above threshold
            description: 'Large transfer',
            // No PIN provided
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('requieren autorización');
    });

    it('should validate PIN for large transfers', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_USER_ID, name: 'Manager', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth query
            {
                rows: [ // Account lock
                    { id: VALID_SAFE_ID, name: 'Caja Fuerte', type: 'SAFE', balance: 10000000, location_id: 'loc-1', is_active: true },
                    { id: VALID_BANK_ID, name: 'Banco', type: 'BANK', balance: 500000, location_id: 'loc-1', is_active: true },
                ]
            },
            { rows: [], rowCount: 1 }, // Update source
            { rows: [] }, // Insert OUT
            { rows: [], rowCount: 1 }, // Update dest
            { rows: [] }, // Insert IN
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(true);

        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: AUTHORIZATION_THRESHOLDS.TRANSFER + 1,
            description: 'Large authorized transfer',
            authorizationPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(mockBcryptCompare).toHaveBeenCalled();
    });

    it('should fail if insufficient funds', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            {
                rows: [ // Account lock - source has low balance
                    { id: VALID_SAFE_ID, name: 'Caja Fuerte', type: 'SAFE', balance: 50000, location_id: 'loc-1', is_active: true },
                    { id: VALID_BANK_ID, name: 'Banco', type: 'BANK', balance: 500000, location_id: 'loc-1', is_active: true },
                ]
            },
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: 100000, // More than available
            description: 'Test transfer',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Fondos insuficientes');
    });

    it('should fail with invalid input (Zod validation)', async () => {
        const result = await transferFundsSecure({
            fromAccountId: 'invalid-uuid',
            toAccountId: VALID_BANK_ID,
            amount: 100000,
            description: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should fail with negative amount', async () => {
        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: -100,
            description: 'Test transfer',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('positivo');
    });
});

describe('depositToBankSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should require authorization PIN for all bank deposits', async () => {
        const result = await depositToBankSecure({
            safeId: VALID_SAFE_ID,
            amount: 100000,
            authorizationPin: '', // Empty PIN
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should deposit to bank with valid PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_MANAGER_ID, name: 'Manager', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ id: VALID_SAFE_ID, name: 'Caja Fuerte', balance: 1000000, location_id: 'loc-1', type: 'SAFE' }] }, // Safe lock
            { rows: [{ id: VALID_BANK_ID }] }, // Bank lookup
            { rows: [], rowCount: 1 }, // Update safe
            { rows: [] }, // Insert OUT transaction
            { rows: [], rowCount: 1 }, // Update bank
            { rows: [] }, // Insert IN transaction
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await depositToBankSecure({
            safeId: VALID_SAFE_ID,
            amount: 100000,
            authorizationPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(result.depositId).toBeDefined();
    });

    it('should fail with invalid PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_MANAGER_ID, name: 'Manager', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth query
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        mockBcryptCompare.mockResolvedValue(false); // Invalid PIN

        const result = await depositToBankSecure({
            safeId: VALID_SAFE_ID,
            amount: 100000,
            authorizationPin: 'wrong-pin',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

describe('confirmRemittanceSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should confirm remittance with valid manager PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_USER_ID, name: 'Gerente', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ id: VALID_REMITTANCE_ID, amount: 50000, location_id: 'loc-1', status: 'PENDING_RECEIPT' }] }, // Remittance lock
            { rows: [{ id: VALID_SAFE_ID, balance: 100000 }] }, // Safe lock
            { rows: [], rowCount: 1 }, // Update safe balance
            { rows: [] }, // Insert transaction
            { rows: [], rowCount: 1 }, // Update remittance status
            { rows: [] }, // Audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await confirmRemittanceSecure({
            remittanceId: VALID_REMITTANCE_ID,
            managerPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
    });

    it('should fail if remittance already processed', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_MANAGER_ID, name: 'Gerente', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Auth
            { rows: [{ id: VALID_REMITTANCE_ID, amount: 50000, location_id: 'loc-1', status: 'RECEIVED' }] }, // Already processed
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await confirmRemittanceSecure({
            remittanceId: VALID_REMITTANCE_ID,
            managerPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ya fue procesada');
    });

    it('should fail if manager PIN does not match user', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: 'different-manager', name: 'Other Manager', role: 'MANAGER', access_pin_hash: 'hashed' }] }, // Different manager
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await confirmRemittanceSecure({
            remittanceId: VALID_REMITTANCE_ID,
            managerPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('no corresponde');
    });
});

describe('createCashMovementSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockBcryptCompare.mockResolvedValue(true);
    });

    it('should create withdrawal without authorization (under threshold)', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_SESSION_ID, terminal_id: VALID_TERMINAL_ID, user_id: VALID_USER_ID, location_id: 'loc-1' }] }, // Terminal Session Check
            { rows: [] }, // INSERT movement
            { rows: [] }, // AUDIT
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await createCashMovementSecure({
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            type: 'WITHDRAWAL',
            amount: 50000, // Under threshold
            reason: 'Cambio de billetes',
        });

        expect(result.success).toBe(true);
        expect(result.movementId).toBeDefined();
    });

    it('should require authorization for large withdrawals', async () => {
        const result = await createCashMovementSecure({
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            type: 'WITHDRAWAL',
            amount: AUTHORIZATION_THRESHOLDS.WITHDRAWAL + 1, // Above threshold
            reason: 'Large withdrawal',
            // No PIN provided
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('requieren autorización');
    });

    it('should create extra income without authorization', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_SESSION_ID, terminal_id: VALID_TERMINAL_ID, user_id: VALID_USER_ID, location_id: 'loc-1' }] }, // Terminal Session Check
            { rows: [] }, // INSERT
            { rows: [] }, // AUDIT
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await createCashMovementSecure({
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            type: 'EXTRA_INCOME',
            amount: 10000,
            reason: 'Ingreso adicional',
        });

        expect(result.success).toBe(true);
    });

    it('should fail if no active session', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // BEGIN
            // Session check in DB is skipped because getSessionSecure fails first
        ];

        // Override cookies for this test to simulate no session
        const mockCookies = await import('next/headers').then(mod => mod.cookies);
        vi.mocked(mockCookies).mockReturnValue({
            get: () => undefined
        } as any);

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await createCashMovementSecure({
            terminalId: VALID_TERMINAL_ID,
            sessionId: VALID_SESSION_ID,
            type: 'WITHDRAWAL',
            amount: 10000,
            reason: 'Test withdrawal',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });
});
