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
const mockDirectQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockRequireRole = vi.fn();
const mockValidatePinForRoles = vi.fn();
const mockValidatePinForUser = vi.fn();

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
        getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
        requireRole: (...args: unknown[]) => mockRequireRole(...args),
        validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
        validatePinForUser: (...args: unknown[]) => mockValidatePinForUser(...args),
        normalizeRole: (role: string | null | undefined) => String(role || '').trim().toUpperCase(),
    };
});

// Import after mocks
import {
    transferFundsSecure,
    depositToBankSecure,
    confirmRemittanceSecure,
    createCashMovementSecure,
} from '@/actions/treasury-v2';
import { PinRbacError } from '@/lib/pin-rbac';

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

function setDefaultPinRbacMocks(role: string = 'MANAGER') {
    mockGetActorOrFail.mockResolvedValue({
        userId: VALID_USER_ID,
        role,
        locationId: 'loc-1',
        userName: 'Manager',
        tokenVersion: 1,
        sessionToken: 'session-token',
    });
    mockRequireRole.mockImplementation((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }
        return actor;
    });
    mockValidatePinForRoles.mockResolvedValue({
        valid: true,
        authorizedBy: { id: VALID_MANAGER_ID, name: 'Manager', role: 'MANAGER' },
    });
    mockValidatePinForUser.mockResolvedValue({
        valid: true,
        authorizedBy: { id: VALID_MANAGER_ID, name: 'Manager', role: 'MANAGER' },
    });
}

// =====================================================
// TESTS
// =====================================================

describe('transferFundsSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
        setDefaultPinRbacMocks();
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

        const result = await transferFundsSecure({
            fromAccountId: VALID_SAFE_ID,
            toAccountId: VALID_BANK_ID,
            amount: AUTHORIZATION_THRESHOLDS.TRANSFER + 1,
            description: 'Large authorized transfer',
            authorizationPin: VALID_PIN,
        });

        expect(result.success).toBe(true);
        expect(mockValidatePinForRoles).toHaveBeenCalled();
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
        mockDirectQuery.mockResolvedValue({ rows: [] });
        setDefaultPinRbacMocks();
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
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });

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
        mockDirectQuery.mockResolvedValue({ rows: [] });
        setDefaultPinRbacMocks();
    });

    it('should confirm remittance with valid manager PIN', async () => {
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
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

    it('should fail if current actor lacks manager role', async () => {
        setDefaultPinRbacMocks('CASHIER');
        const result = await confirmRemittanceSecure({
            remittanceId: VALID_REMITTANCE_ID,
            managerPin: VALID_PIN,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No tiene permisos');
    });
});

describe('createCashMovementSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDirectQuery.mockResolvedValue({ rows: [] });
        setDefaultPinRbacMocks();
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
        mockGetActorOrFail.mockRejectedValue(new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'));

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
