/**
 * Unit Tests - Users V2 Module (formerly integration)
 * Refactored to use Mocks to avoid DB saturation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserSecure } from '@/actions/users-v2'; // Assuming this export exists
import * as dbModule from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { getValidatedSession } from '@/lib/server-session';

// Mocks
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(async (s) => `hashed_${s}`),
        compare: vi.fn(async (p, h) => h === `hashed_${p}`)
    },
    hash: vi.fn(async (s) => `hashed_${s}`),
    compare: vi.fn(async (p, h) => h === `hashed_${p}`)
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn()
}));

// Mock Next Headers for technical context only
vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue(new Map([['x-forwarded-for', '127.0.0.1']])),
    cookies: vi.fn().mockResolvedValue({ get: vi.fn(() => undefined) })
}));

// Mock DB
const mockClient = {
    query: vi.fn(),
    release: vi.fn()
};

vi.mock('@/lib/db', () => ({
    pool: {
        query: vi.fn(),
        connect: vi.fn()
    },
    getClient: vi.fn(() => Promise.resolve(mockClient)) // Fix for notification import
}));

describe('Users V2 Unit Tests', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
        vi.mocked(getValidatedSession).mockResolvedValue({
            userId: 'admin-uuid',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin User',
            tokenVersion: 1,
            sessionToken: 'session-token'
        });

        // Mock Admin User Fetch for verifyAdminPermission
        mockClient.query.mockImplementation(async (sql: string, params: any[]) => {
            if (sql.startsWith('BEGIN')) return { rows: [] };
            // Mock fetching the admin user for permission check
            if (sql.includes('SELECT id, name, role') && params && params[0] === 'admin-uuid') {
                return { rows: [{ id: 'admin-uuid', name: 'Admin User', role: 'ADMIN' }] };
            }
            return { rows: [] };
        });
    });

    it('should create a new user successfully with hashed password', async () => {
        // Setup mock for creation flow on TOP of the default one
        mockClient.query.mockImplementation(async (sql: string, params: any[]) => {
            if (sql.startsWith('BEGIN')) return { rows: [] };
            if (sql.startsWith('COMMIT')) return { rows: [] };

            // Mock Admin Retrieval (CRITICAL for verifyAdminPermission)
            if (sql.includes('SELECT id, name, role') && sql.includes('FROM users')) {
                return { rows: [{ id: 'admin-uuid', name: 'Admin', role: 'ADMIN' }] };
            }

            // 1. Check existing RUT
            if (sql.includes('SELECT id FROM users WHERE rut')) return { rows: [] }; // No dupe

            // 2. Check existing Email
            if (sql.includes('SELECT id FROM users WHERE email')) return { rows: [] }; // No dupe

            // 3. Insert User
            if (sql.includes('INSERT INTO users')) return { rows: [{ id: 'new-user-id', role: 'seller' }] };

            return { rows: [] };
        });

        const newUser = {
            rut: '12345678-9',
            name: 'Test User',
            email: 'test@example.com',
            access_pin: '1234',
            role: 'CASHIER',
            branchId: '550e8400-e29b-41d4-a716-446655440000'
        } as any;

        const res = await createUserSecure(newUser);

        expect(res.success).toBe(true);
        expect(res.data).toBeDefined();
        expect(bcrypt.hash).toHaveBeenCalled();
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
    });

    it('should fail if user already exists', async () => {
        mockClient.query.mockImplementation(async (sql: string) => {
            if (sql.startsWith('BEGIN')) return { rows: [] };
            if (sql.startsWith('ROLLBACK')) return { rows: [] };

            // Admin Check
            if (sql.includes('SELECT id, name, role') && sql.includes('FROM users')) {
                return { rows: [{ id: 'admin-uuid', name: 'Admin', role: 'ADMIN' }] };
            }

            // Simulate existing RUT
            if (sql.includes('SELECT id FROM users WHERE rut')) return { rows: [{ id: 'existing' }] };
            return { rows: [] };
        });

        const res = await createUserSecure({
            rut: '12345678-9',
            name: 'Dupe User',
            email: 'dupe@example.com',
            access_pin: '1234',
            role: 'CASHIER',
            branchId: 'valid-uuid'
        } as any);

        expect(res.success).toBe(false);
        expect(res.error).toMatch(/existe|rut/i);
    });
});
