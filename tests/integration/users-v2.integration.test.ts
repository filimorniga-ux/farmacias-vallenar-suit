/**
 * Integration Tests - Users V2 Module
 * Uses real database connection for accurate testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import * as usersV2 from '@/actions/users-v2';

// Test database connection
const testPool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

// Test data
const TEST_ADMIN = {
    id: 'test-admin-uuid-001',
    rut: '11111111-1',
    name: 'Test Admin',
    email: 'admin@test.com',
    role: 'ADMIN',
    access_pin_hash: '$2a$10$test.hash.for.pin.1234',
    is_active: true,
};

const TEST_USER = {
    id: 'test-user-uuid-002',
    rut: '22222222-2',
    name: 'Test User',
    email: 'user@test.com',
    role: 'CASHIER',
    access_pin_hash: '$2a$10$test.hash.for.pin.5678',
    is_active: true,
};

// Setup and teardown
beforeAll(async () => {
    console.log('🔧 Setting up test database...');

    // Create test users table if not exists (should already exist from migrations)
    // Just clean it for tests
    await testPool.query('DELETE FROM users WHERE id LIKE \'test-%\'');

    // Insert test admin
    await testPool.query(`
        INSERT INTO users (
            id, rut, name, email, role, access_pin_hash, is_active,
            job_title, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADMIN', 'ACTIVE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    `, [
        TEST_ADMIN.id,
        TEST_ADMIN.rut,
        TEST_ADMIN.name,
        TEST_ADMIN.email,
        TEST_ADMIN.role,
        TEST_ADMIN.access_pin_hash,
        TEST_ADMIN.is_active,
    ]);

    console.log('✅ Test database ready');
});

afterAll(async () => {
    console.log('🧹 Cleaning up test database...');

    // Clean up test data
    await testPool.query('DELETE FROM users WHERE id LIKE \'test-%\'');
    await testPool.query('DELETE FROM audit_log WHERE user_id LIKE \'test-%\'');

    await testPool.end();
    console.log('✅ Test database cleaned');
});

beforeEach(async () => {
    // Clean up test users created during tests (except admin)
    await testPool.query('DELETE FROM users WHERE id LIKE \'test-%\' AND id != $1', [TEST_ADMIN.id]);
    await testPool.query('DELETE FROM audit_log WHERE entity_id LIKE \'test-%\'');
});

// ============================================================================
// TESTS - Input Validation
// ============================================================================

describe('Users V2 Integration - Input Validation', () => {
    it('should reject invalid email format', async () => {
        const result = await usersV2.createUserSecure({
            rut: '33333333-3',
            name: 'Test User',
            email: 'invalid-email',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Email');
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
            rut: '33333333-3',
            name: 'Test User',
            role: 'INVALID_ROLE' as any,
            access_pin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
    });

    it('should reject PIN too short', async () => {
        const result = await usersV2.createUserSecure({
            rut: '33333333-3',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '123' // Only 3 digits
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should reject non-numeric PIN', async () => {
        const result = await usersV2.createUserSecure({
            rut: '33333333-3',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: 'abcd'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});

// ============================================================================
// TESTS - User Creation
// ============================================================================

describe('Users V2 Integration - User Creation', () => {
    it('should create user with hashed PIN', async () => {
        const result = await usersV2.createUserSecure({
            rut: '44444444-4',
            name: 'New Test User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.id).toBeDefined();

        // Verify PIN is hashed in database
        const dbUser = await testPool.query(
            'SELECT access_pin_hash, access_pin FROM users WHERE id = $1',
            [result.data?.id]
        );

        expect(dbUser.rows[0].access_pin_hash).toBeDefined();
        expect(dbUser.rows[0].access_pin_hash).toContain('$2a$'); // bcrypt format
        expect(dbUser.rows[0].access_pin).toBeNull();
    });

    it('should reject duplicate RUT', async () => {
        // Create first user
        await usersV2.createUserSecure({
            rut: '55555555-5',
            name: 'First User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        // Try to create duplicate
        const result = await usersV2.createUserSecure({
            rut: '55555555-5',
            name: 'Duplicate User',
            role: 'CASHIER',
            access_pin: '5678'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('RUT');
    });
});

// ============================================================================
// TESTS - User Updates
// ============================================================================

describe('Users V2 Integration - User Updates', () => {
    it('should update user name', async () => {
        // Create user first
        const createResult = await usersV2.createUserSecure({
            rut: '66666666-6',
            name: 'Original Name',
            role: 'CASHIER',
            access_pin: '1234'
        });

        const userId = createResult.data?.id!;

        // Update name
        const updateResult = await usersV2.updateUserSecure({
            userId,
            name: 'Updated Name'
        });

        expect(updateResult.success).toBe(true);

        // Verify in database
        const dbUser = await testPool.query(
            'SELECT name FROM users WHERE id = $1',
            [userId]
        );

        expect(dbUser.rows[0].name).toBe('Updated Name');
    });
});

// ============================================================================
// TESTS - Role Changes
// ============================================================================

describe('Users V2 Integration - Role Changes', () => {
    it('should require justification for role change', async () => {
        const createResult = await usersV2.createUserSecure({
            rut: '77777777-7',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        const result = await usersV2.changeUserRoleSecure({
            userId: createResult.data?.id!,
            newRole: 'MANAGER',
            justification: 'Short' // Too short
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });

    it('should change role with proper justification', async () => {
        const createResult = await usersV2.createUserSecure({
            rut: '88888888-8',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        const userId = createResult.data?.id!;

        const result = await usersV2.changeUserRoleSecure({
            userId,
            newRole: 'MANAGER',
            justification: 'Promoted due to excellent performance and leadership'
        });

        expect(result.success).toBe(true);

        // Verify in database
        const dbUser = await testPool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        expect(dbUser.rows[0].role).toBe('MANAGER');
    });
});

// ============================================================================
// TESTS - Deactivation
// ============================================================================

describe('Users V2 Integration - Deactivation', () => {
    it('should soft delete user', async () => {
        const createResult = await usersV2.createUserSecure({
            rut: '99999999-9',
            name: 'Test User',
            role: 'CASHIER',
            access_pin: '1234'
        });

        const userId = createResult.data?.id!;

        const result = await usersV2.deactivateUserSecure({
            userId,
            reason: 'Employee resigned from position'
        });

        expect(result.success).toBe(true);

        // Verify soft delete (data preserved, is_active = false)
        const dbUser = await testPool.query(
            'SELECT is_active, name FROM users WHERE id = $1',
            [userId]
        );

        expect(dbUser.rows[0].is_active).toBe(false);
        expect(dbUser.rows[0].name).toBe('Test User'); // Data preserved
    });

    it('should require deactivation reason', async () => {
        const result = await usersV2.deactivateUserSecure({
            userId: 'test-user-uuid-002',
            reason: 'Short' // Too short
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });
});

// ============================================================================
// TESTS - Get Users
// ============================================================================

describe('Users V2 Integration - Get Users', () => {
    it('should never return PIN hash', async () => {
        const result = await usersV2.getUsersSecure({ page: 1, pageSize: 50 });

        expect(result.success).toBe(true);
        expect(result.data?.users).toBeDefined();

        // Verify no user has PIN hash in response
        result.data?.users.forEach(user => {
            expect(user).not.toHaveProperty('access_pin');
            expect(user).not.toHaveProperty('access_pin_hash');
        });
    });
});

console.log(`
✅ Integration tests for users-v2 module
   Using TEST_DATABASE_URL or DATABASE_URL for connection
   Requires database with users table and audit_log table
`);
