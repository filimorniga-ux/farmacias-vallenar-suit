/**
 * Tests - Auth Recovery V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as authRecoveryV2 from '@/actions/auth-recovery-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Auth Recovery V2 - Password Validation', () => {
    it('should reject password without uppercase', async () => {
        const result = await authRecoveryV2.resetPasswordSecure('a'.repeat(64), 'password123');
        expect(result.success).toBe(false);
        expect(result.message).toContain('mayúscula');
    });

    it('should reject password without number', async () => {
        const result = await authRecoveryV2.resetPasswordSecure('a'.repeat(64), 'PasswordABC');
        expect(result.success).toBe(false);
        expect(result.message).toContain('número');
    });

    it('should reject password too short', async () => {
        const result = await authRecoveryV2.resetPasswordSecure('a'.repeat(64), 'Pass1');
        expect(result.success).toBe(false);
        expect(result.message).toContain('8');
    });

    it('should reject invalid token format', async () => {
        const result = await authRecoveryV2.resetPasswordSecure('short', 'Password123');
        expect(result.success).toBe(false);
    });
});

describe('Auth Recovery V2 - Forgot Password', () => {
    it('should reject invalid email', async () => {
        const result = await authRecoveryV2.forgotPasswordSecure('not-an-email');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Email');
    });

    it('should return same message for existing and non-existing emails (anti-enumeration)', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const result1 = await authRecoveryV2.forgotPasswordSecure('nonexistent@test.com');

        vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ id: '1', name: 'Test' }], rowCount: 1 } as any);
        vi.mocked(mockDb.query).mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 } as any));

        const result2 = await authRecoveryV2.forgotPasswordSecure('existing@test.com');

        // Both should return success with generic message
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result1.message).toBe(result2.message); // Same message
    });
});

describe('Auth Recovery V2 - Token Validation', () => {
    it('should reject invalid token', async () => {
        const result = await authRecoveryV2.validateResetToken('invalid');
        expect(result.valid).toBe(false);
    });
});
