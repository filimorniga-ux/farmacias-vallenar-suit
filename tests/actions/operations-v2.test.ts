/**
 * Tests - Operations V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as operationsV2 from '@/actions/operations-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: vi.fn(() => ({ allowed: true })),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn()
}));
vi.mock('bcryptjs', () => ({
    default: { compare: vi.fn(async (p: string, h: string) => h === `hashed_${p}`) },
    compare: vi.fn(async (p: string, h: string) => h === `hashed_${p}`)
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

describe('Operations V2 - Shift Management', () => {
    it('should require valid locationId', async () => {
        const result = await operationsV2.getShiftStatusSecure('invalid-id');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('should require MANAGER PIN to open shift', async () => {
        const result = await operationsV2.openShiftSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            managerPin: '' // Empty PIN
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});

describe('Operations V2 - Clock In/Out', () => {
    it('should validate UUIDs for clockIn', async () => {
        const result = await operationsV2.clockInSecure({
            userId: 'invalid',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            method: 'PIN'
        });
        expect(result.success).toBe(false);
    });

    it('should validate UUIDs for clockOut', async () => {
        const result = await operationsV2.clockOutSecure('invalid', 'invalid');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválidos');
    });
});

describe('Operations V2 - Ticket Generation', () => {
    it('should validate ticket type', async () => {
        const result = await operationsV2.generateTicketSecure(
            'INVALID' as any,
            '550e8400-e29b-41d4-a716-446655440001'
        );
        expect(result.success).toBe(false);
    });

    it('should require valid locationId', async () => {
        const result = await operationsV2.generateTicketSecure('GENERAL', 'invalid');
        expect(result.success).toBe(false);
    });
});
