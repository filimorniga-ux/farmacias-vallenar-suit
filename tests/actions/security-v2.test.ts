// DEPRECATED: Migrating to E2E
/**
 * Unit Tests - Security V2 Module
 * Tests for secure session management, account locking, and security audit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as securityV2 from '@/actions/security-v2';
import * as dbModule from '@/lib/db';

// Mock content
const validAdminId = '550e8400-e29b-41d4-a716-446655440001';
const validUserId = '550e8400-e29b-41d4-a716-446655440002';

const { mockHeaders } = vi.hoisted(() => ({
    mockHeaders: new Map([
        ['x-user-id', '550e8400-e29b-41d4-a716-446655440001'],
        ['x-user-role', 'ADMIN']
    ])
}));

vi.mock('next/headers', () => ({
    headers: vi.fn().mockReturnValue(Promise.resolve(mockHeaders)),
    cookies: vi.fn(() => ({ get: vi.fn() }))
}));

vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn()
    },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(async (password: string) => `hashed_${password}`),
        compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`)
    },
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`)
}));

vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: vi.fn(() => ({
        allowed: true,
        remainingAttempts: 5,
        blockedUntil: null,
        reason: null
    })),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('crypto', () => ({
    randomBytes: vi.fn(() => ({ toString: () => 'mock-token-123456' }))
}));

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.set('x-user-id', validAdminId); // Reset to default admin
    mockHeaders.set('x-user-role', 'ADMIN');
});

// Test data
const mockAdmin = {
    id: validAdminId,
    name: 'Admin User',
    role: 'ADMIN',
    access_pin_hash: 'hashed_1234',
    is_active: true
};

const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Test User',
    role: 'CASHIER',
    token_version: 1,
    is_active: true,
    account_locked_until: null,
    account_locked_permanently: false
};

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Session Validation', () => {
    it('should validate active session', async () => {
        const mockClient = createMockClient([
            { rows: [mockUser], rowCount: 1 }, // User query
            { rows: [], rowCount: 0 } // Update activity
        ]);

        const result = await securityV2.validateSessionSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            1
        );

        expect(result.valid).toBe(true);
        // validateSessionSecure uses direct query, not transaction
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('SELECT id'),
            expect.any(Array)
        );
    });

    it('should reject invalid token version', async () => {
        const userWithHigherVersion = { ...mockUser, token_version: 5 };
        const mockClient = createMockClient([
            { rows: [userWithHigherVersion], rowCount: 1 }
        ]);

        const result = await securityV2.validateSessionSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            1 // Client has old version
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('revocada');
    });

    it('should reject inactive user', async () => {
        const inactiveUser = { ...mockUser, is_active: false };
        createMockClient([
            { rows: [inactiveUser], rowCount: 1 }
        ]);

        const result = await securityV2.validateSessionSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            1
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('deshabilitado');
    });

    it('should reject permanently locked account', async () => {
        const lockedUser = { ...mockUser, account_locked_permanently: true };
        createMockClient([
            { rows: [lockedUser], rowCount: 1 }
        ]);

        const result = await securityV2.validateSessionSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            1
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('bloqueada permanentemente');
    });

    it('should reject invalid userId format', async () => {
        const result = await securityV2.validateSessionSecure(
            'invalid-uuid',
            1
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Account Locking', () => {
    it('should lock account after threshold failures', async () => {
        const userWith4Failures = { ...mockUser, login_failure_count: 4 };
        const mockClient = createMockClient([
            { rows: [userWith4Failures], rowCount: 1 }, // Get user
            { rows: [], rowCount: 1 }, // Update user
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await securityV2.lockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            'Failed login attempt'
        );

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE users'),
            expect.arrayContaining([5]) // New failure count
        );
    });

    it('should permanently lock after 10 failures', async () => {
        const userWith9Failures = { ...mockUser, login_failure_count: 9 };
        const mockClient = createMockClient([
            { rows: [userWith9Failures], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await securityV2.lockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            'Too many failures'
        );

        // Should set permanent lock
        const updateCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('UPDATE users') &&
                call[1]?.includes(true) // account_locked_permanently
        );
        expect(updateCall).toBeDefined();
    });

    it('should require valid reason', async () => {
        const result = await securityV2.lockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            'ab' // Too short
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Razón');
    });
});

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Account Unlocking', () => {
    it('should unlock with valid ADMIN PIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth query
            { rows: [{ ...mockUser, account_locked_permanently: true }], rowCount: 1 }, // Target user
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await securityV2.unlockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            '1234',
            'User requested unlock'
        );

        expect(result.success).toBe(true);
    });

    it('should reject invalid ADMIN PIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }
        ]);

        const bcrypt = await import('bcryptjs');
        vi.mocked(bcrypt.compare).mockImplementationOnce(async () => false);

        const result = await securityV2.unlockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            '9999', // Invalid PIN (but valid length)
            'Unlock attempt'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should reset rate limiter on unlock', async () => {
        const rateLimiter = await import('@/lib/rate-limiter');
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await securityV2.unlockAccountSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            '1234',
            'Reset user'
        );

        expect(rateLimiter.resetAttempts).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440002');
    });
});

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Token Rotation', () => {
    it('should rotate token and increment version', async () => {
        const mockClient = createMockClient([
            { rows: [{ ...mockUser, token_version: 1 }], rowCount: 1 }, // Get user
            { rows: [], rowCount: 1 } // Update
        ]);

        const result = await securityV2.rotateSessionSecure('550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(true);
        expect(result.newTokenVersion).toBe(2);
        expect(result.sessionToken).toBeDefined();
    });

    it('should reject inactive user', async () => {
        createMockClient([
            { rows: [], rowCount: 0 } // User not found
        ]);

        const result = await securityV2.rotateSessionSecure('550e8400-e29b-41d4-a716-446655440002');

        expect(result.success).toBe(false);
        expect(result.error).toContain('no encontrado');
    });
});

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Force Logout', () => {
    it('should force logout with valid MANAGER PIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth
            { rows: [mockUser], rowCount: 1 }, // Target
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await securityV2.forceLogoutSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            '1234',
            'Security concern'
        );

        expect(result.success).toBe(true);
    });

    it('should prevent self-logout', async () => {
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 }
        ]);

        const result = await securityV2.forceLogoutSecure(
            '550e8400-e29b-41d4-a716-446655440001', // Same as admin
            '1234',
            'Test'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('propia');
    });

    it('should increment token version on logout', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [{ ...mockUser, token_version: 3 }], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await securityV2.forceLogoutSecure(
            '550e8400-e29b-41d4-a716-446655440002',
            '1234',
            'Force logout'
        );

        const updateCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('token_version') &&
                call[0].includes('+ 1')
        );
        expect(updateCall).toBeDefined();
    });
});

// TODO: Refactor mocks - these tests fail due to complex pool.connect mock issues
describe('Security V2 - Audit Log', () => {
    it('should return paginated security logs', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ total: '25' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({
                rows: [
                    { id: '1', action: 'LOGIN_SUCCESS', timestamp: new Date() },
                    { id: '2', action: 'ACCOUNT_LOCKED', timestamp: new Date() }
                ],
                rowCount: 2
            } as any);

        const result = await securityV2.getSecurityAuditLog({ page: 1, pageSize: 50 });

        expect(result.success).toBe(true);
        expect(result.data?.logs.length).toBeGreaterThan(0);
        expect(result.data?.total).toBe(25);
    });

    it('should filter by userId', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ total: '10' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        await securityV2.getSecurityAuditLog({
            page: 1,
            pageSize: 50,
            userId: '550e8400-e29b-41d4-a716-446655440002'
        });

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('user_id'),
            expect.arrayContaining(['550e8400-e29b-41d4-a716-446655440002'])
        );
    });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockClient(queryResults: any[] = []) {
    let callIndex = 0;

    const mockClient = {
        query: vi.fn((sql: string, params?: any[]) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
                return Promise.resolve({});
            }
            if (sql === 'COMMIT' || sql === 'ROLLBACK') {
                return Promise.resolve({});
            }

            if (callIndex < queryResults.length) {
                return Promise.resolve(queryResults[callIndex++]);
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }),
        release: vi.fn().mockImplementation(() => { })
    };

    vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
    vi.mocked(dbModule.query).mockImplementation(mockClient.query as any); // Mock top-level query too

    return mockClient;
}
