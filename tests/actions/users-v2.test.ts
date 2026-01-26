// DEPRECATED: Migrating to E2E
/**
 * Unit Tests - Users V2 Module
 * Tests for secure user management with RBAC, bcrypt PINs, and audit logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as usersV2 from '@/actions/users-v2';
import * as dbModule from '@/lib/db';

// Mock content
const validAdminId = '550e8400-e29b-41d4-a716-446655440001';
const validUserId = '550e8400-e29b-41d4-a716-446655440002';
const newUserId = '550e8400-e29b-41d4-a716-446655440003';

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

vi.mock('@/lib/db', () => {
    const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
    };
    return {
        pool: {
            connect: vi.fn().mockResolvedValue(mockClient),
            query: vi.fn(),
            on: vi.fn(),
        },
        getClient: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn()
    };
});

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(async (password: string) => `hashed_${password}`),
        compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`)
    },
    hash: vi.fn(async (password: string) => `hashed_${password}`),
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

vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440003')
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
    is_active: true
};

const mockUser = {
    id: validUserId,
    rut: '12345678-9',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'CASHIER',
    status: 'ACTIVE',
    is_active: true,
    job_title: 'CAJERO_VENDEDOR',
    assigned_location_id: null,
    contact_phone: null,
    base_salary: 500000,
    pension_fund: 'PROVIDA',
    health_system: 'FONASA',
    weekly_hours: 45,
    created_at: new Date(),
    updated_at: new Date()
};

// GERENTE_GENERAL for role change tests
const mockGerenteGeneral = {
    id: '550e8400-e29b-41d4-a716-446655440099',
    name: 'Gerente General',
    role: 'GERENTE_GENERAL',
    is_active: true
};

describe('Users V2 - Input Validation', () => {
    it('should reject invalid email format', async () => {
        const mockClient = createMockClient();

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Test User',
            email: 'invalid-email',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Email inválido');
    });

    it('should reject invalid RUT format', async () => {
        const result = await usersV2.createUserSecure({
            rut: '123456789', // Missing hyphen and verification digit
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('RUT');
    });

    it('should reject invalid role', async () => {
        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Test User',
            role: 'INVALID_ROLE' as any,
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
    });

    it('should reject PIN too short', async () => {
        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '123' // Only 3 digits
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN debe tener al menos 4 dígitos');
    });

    it('should reject non-numeric PIN', async () => {
        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: 'abcd'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN debe contener solo números');
    });

    it('should reject negative salary', async () => {
        const mockClient = createMockClient();

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '1234',
            base_salary: -1000
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Salario debe ser positivo');
    });
});

// Testing RBAC - Re-enabled to diagnose mock issues
describe('Users V2 - RBAC Enforcement', () => {
    it('should allow ADMIN to create user', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Admin check
            { rows: [], rowCount: 0 }, // RUT exists check
            { rows: [{ ...mockUser, id: '550e8400-e29b-41d4-a716-446655440003' }], rowCount: 1 }, // Create
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'New User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(mockClient.query).toHaveBeenCalled();
    });

    it('should reject non-ADMIN creating user', async () => {
        const mockClient = createMockClient([
            {
                rows: [{ ...mockAdmin, role: 'CASHIER' }],
                rowCount: 1
            } // Non-admin
        ]);

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'New User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('permisos de ADMIN');
    });

    it('should reject unauthenticated user', async () => {
        vi.mocked(await import('next/headers')).headers.mockResolvedValueOnce(
            new Map() as any
        );

        const mockClient = createMockClient([]);

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'New User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('should enforce RBAC on updateUserSecure', async () => {
        const mockClient = createMockClient([
            { rows: [{ ...mockAdmin, role: 'CASHIER' }], rowCount: 1 }
        ]);

        const result = await usersV2.updateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            name: 'Updated Name'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('permisos de ADMIN');
    });
});

// PIN Security tests
describe('Users V2 - PIN Security', () => {
    // TODO: Mock intercept issue - bcrypt.hash is called but mock doesn't capture it
    it.skip('should hash PIN with bcrypt on creation', async () => {
        const bcrypt = await import('bcryptjs');
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [], rowCount: 0 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'New User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(bcrypt.default.hash).toHaveBeenCalledWith('1234', 10);

        // Verify PIN hash was saved, not plaintext
        const insertCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('INSERT INTO users')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain('hashed_1234');
        expect(insertCall![1]).not.toContain('1234');
    });

    // TODO: Mock intercept issue - bcrypt.hash is called but mock doesn't capture it
    it.skip('should hash PIN on reset', async () => {
        const bcrypt = await import('bcryptjs');
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Admin check
            { rows: [mockUser], rowCount: 1 }, // Update result
            { rows: [], rowCount: 0 } // Audit
        ]);

        await usersV2.resetUserPinSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newPin: '5678'
        });

        expect(bcrypt.default.hash).toHaveBeenCalledWith('5678', 10);
    });

    it('should never store plaintext PIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [], rowCount: 0 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'New User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        // Check all query calls - none should reference access_pin with value
        mockClient.query.mock.calls.forEach((call: any) => {
            const sql = call[0];
            const params = call[1];

            if (sql.includes('INSERT INTO users')) {
                // Should set access_pin to NULL
                expect(sql).toContain('access_pin_hash');
                // PIN should be hashed
                if (params) {
                    const pinHashIndex = params.findIndex((p: any) =>
                        typeof p === 'string' && p.startsWith('hashed_')
                    );
                    expect(pinHashIndex).toBeGreaterThanOrEqual(0);
                }
            }
        });
    });

    it('should integrate rate limiting on PIN reset', async () => {
        const rateLimiter = await import('@/lib/rate-limiter');
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        await usersV2.resetUserPinSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newPin: '5678'
        });

        expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440002');
        expect(rateLimiter.resetAttempts).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440002');
    });

    it('should block PIN reset if rate limited', async () => {
        const rateLimiter = await import('@/lib/rate-limiter');
        vi.mocked(rateLimiter.checkRateLimit).mockReturnValueOnce({
            allowed: false,
            remainingAttempts: 0,
            blockedUntil: new Date(Date.now() + 15 * 60 * 1000),
            reason: 'Demasiados intentos'
        });

        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }
        ]);

        const result = await usersV2.resetUserPinSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newPin: '5678'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Demasiados intentos');
    });
});

// Role Change tests
describe('Users V2 - Role Change Logic', () => {
    it('should require justification for role change', async () => {
        const result = await usersV2.changeUserRoleSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newRole: 'MANAGER',
            justification: 'Short' // Too short
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('mínimo 10 caracteres');
    });

    // Self-promotion prevention - using GERENTE_GENERAL role
    it('should prevent user from changing own role', async () => {
        const mockClient = createMockClient([
            { rows: [mockGerenteGeneral], rowCount: 1 }
        ]);

        const result = await usersV2.changeUserRoleSecure({
            userId: '550e8400-e29b-41d4-a716-446655440099', // Same as mockGerenteGeneral
            newRole: 'ADMIN',
            justification: 'Attempting self-promotion should fail'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('propio rol');
    });

    // Last admin protection
    it('should prevent removing last ADMIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockGerenteGeneral], rowCount: 1 }, // Auth check (GERENTE_GENERAL)
            { rows: [{ ...mockUser, role: 'ADMIN' }], rowCount: 1 }, // Target user is ADMIN
            { rows: [{ count: '1' }], rowCount: 1 } // Only 1 admin exists
        ]);

        const result = await usersV2.changeUserRoleSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newRole: 'CASHIER',
            justification: 'Removing admin privileges from user'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('administrador');
    });

    // Successful role change with GERENTE_GENERAL
    it('should allow role change with proper justification', async () => {
        const mockClient = createMockClient([
            { rows: [mockGerenteGeneral], rowCount: 1 }, // GERENTE_GENERAL auth
            { rows: [mockUser], rowCount: 1 }, // Target user
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 1 } // Audit
        ]);

        const result = await usersV2.changeUserRoleSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newRole: 'MANAGER',
            justification: 'Promoted due to excellent performance and leadership skills'
        });

        expect(result.success).toBe(true);
    });

    // Audit log verification
    it('should audit role change with old and new values', async () => {
        const mockClient = createMockClient([
            { rows: [mockGerenteGeneral], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 1 }
        ]);

        await usersV2.changeUserRoleSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            newRole: 'MANAGER',
            justification: 'Promotion for excellent work over the year'
        });

        // Verify audit was called
        expect(mockClient.query).toHaveBeenCalled();
    });
});

// Deactivation tests
describe('Users V2 - Deactivation Logic', () => {
    it('should prevent self-deactivation', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }
        ]);

        const result = await usersV2.deactivateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440001', // Same as current admin
            reason: 'Leaving company'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No puedes desactivarte a ti mismo');
    });

    it('should prevent deactivating last ADMIN', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth
            { rows: [{ ...mockUser, role: 'ADMIN', is_active: true }], rowCount: 1 }, // User
            { rows: [{ count: '1' }], rowCount: 1 } // Admin count
        ]);

        const result = await usersV2.deactivateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            reason: 'No longer needed'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('último administrador');
    });

    it('should soft delete (preserve data)', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 1 } // Audit
        ]);

        await usersV2.deactivateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            reason: 'Employee resigned'
        });

        const updateCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('UPDATE users') &&
                call[0].includes('is_active = false')
        );

        expect(updateCall).toBeDefined();
        // Should NOT use DELETE
        const deleteCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].toUpperCase().includes('DELETE FROM users')
        );
        expect(deleteCall).toBeUndefined();
    });

    it('should require deactivation reason', async () => {
        const result = await usersV2.deactivateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            reason: 'Short' // Too short
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('mínimo 10 caracteres');
    });

    it('should audit deactivation with reason', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 1 }
        ]);

        await usersV2.deactivateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            reason: 'Contract ended naturally'
        });

        const auditCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('INSERT INTO audit_log')
        );

        expect(auditCall).toBeDefined();
        expect(auditCall![1]).toContain('USER_DEACTIVATED');
        expect(auditCall![1]).toContain('Contract ended naturally');
    });
});

// Additional tests
describe('Users V2 - Additional Cases', () => {
    it('should handle duplicate RUT on creation', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [{ id: 'existing-user' }], rowCount: 1 } // RUT exists
        ]);

        const result = await usersV2.createUserSecure({
            rut: '12345678-9',
            name: 'Duplicate User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('RUT ya está registrado');
    });

    it('should never return PIN hash in getUsersSecure', async () => {
        const mockPool = await import('@/lib/db');
        vi.mocked(mockPool.pool.query).mockResolvedValueOnce({
            rows: [{ total: '2' }],
            rowCount: 1
        } as any).mockResolvedValueOnce({
            rows: [mockUser, { ...mockUser, id: 'user-2' }],
            rowCount: 2
        } as any);

        const result = await usersV2.getUsersSecure({ page: 1, pageSize: 50 });

        expect(result.success).toBe(true);
        expect(result.data?.users).toHaveLength(2);

        // Verify SELECT does NOT include access_pin or access_pin_hash
        const selectCall = vi.mocked(mockPool.pool.query).mock.calls[1];
        expect(selectCall[0]).not.toContain('access_pin');
        expect(selectCall[0]).not.toContain('access_pin_hash');
    });

    it('should use NOWAIT locking to prevent deadlocks', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockUser], rowCount: 1 }
        ]);

        await usersV2.updateUserSecure({
            userId: '550e8400-e29b-41d4-a716-446655440002',
            name: 'Updated Name'
        });

        const lockCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('FOR UPDATE NOWAIT')
        );

        expect(lockCall).toBeDefined();
    });
});


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
        release: vi.fn()
    };

    vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);

    return mockClient;
}

