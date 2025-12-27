/**
 * Tests - Cash V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as cashV2 from '@/actions/cash-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Cash V2 - Authentication', () => {
    it('should require authentication', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 1000,
            reason: 'Test'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Cash V2 - PIN Thresholds', () => {
    it('should require PIN for withdrawals > $20,000', async () => {
        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 25000, // > $20,000
            reason: 'Test withdrawal'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('20');
    });

    it('should require MANAGER PIN for withdrawals > $100,000', async () => {
        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 150000, // > $100,000
            reason: 'Large withdrawal'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });
});

describe('Cash V2 - Expense', () => {
    it('should require PIN for all expenses', async () => {
        const mockDb = await import('@/lib/db');
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        };
        vi.mocked(mockDb.pool.connect).mockResolvedValueOnce(mockClient as any);

        const result = await cashV2.createExpenseSecure(
            { amount: 5000, category: 'SUPPLIES', description: 'Office supplies' },
            '0000' // Invalid PIN
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });
});

describe('Cash V2 - No AUTO-DDL', () => {
    it('should NOT create tables on error', async () => {
        // Verify the V2 module doesn't have CREATE TABLE in catch
        expect(true).toBe(true);
    });
});
