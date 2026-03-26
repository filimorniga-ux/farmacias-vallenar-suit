/**
 * Tests - Hardware V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as hardwareV2 from '@/actions/hardware-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'CASHIER',
        locationId: 'loc-1',
        userName: 'Caja',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Hardware V2 - Authentication', () => {
    it('should require authentication', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await hardwareV2.getTerminalHardwareConfigSecure(
            '550e8400-e29b-41d4-a716-446655440000'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Hardware V2 - Validation', () => {
    it('should validate terminal ID format', async () => {
        const result = await hardwareV2.getTerminalHardwareConfigSecure('invalid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

describe('Hardware V2 - Update Config', () => {
    it('should require PIN for config updates', async () => {
        const mockDb = await import('@/lib/db');
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        };
        vi.mocked(mockDb.pool.connect).mockResolvedValueOnce(mockClient as any);

        const result = await hardwareV2.updateTerminalHardwareConfigSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            { receipt_printer: 'EPSON' },
            '0000' // Invalid PIN
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });
});
