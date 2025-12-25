/**
 * Tests - Financial Accounts V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as financialAccountsV2 from '@/actions/financial-accounts-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Financial Accounts V2 - Authentication', () => {
    it('should require authentication for get', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await financialAccountsV2.getFinancialAccountsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Financial Accounts V2 - RBAC', () => {
    it('should require ADMIN PIN to create account', async () => {
        const mockDb = await import('@/lib/db');
        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
            release: vi.fn()
        };
        vi.mocked(mockDb.pool.connect).mockResolvedValueOnce(mockClient as any);

        const result = await financialAccountsV2.createFinancialAccountSecure(
            { name: 'Test Account', type: 'BANK', initialBalance: 0 },
            '0000' // Invalid PIN
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('administrador');
    });
});

describe('Financial Accounts V2 - Balance', () => {
    it('should validate account ID', async () => {
        const result = await financialAccountsV2.getAccountBalance('invalid-id');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});
