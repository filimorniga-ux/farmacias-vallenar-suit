/**
 * Tests - Hardware V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as hardwareV2 from '@/actions/hardware-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Hardware V2 - Authentication', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

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
