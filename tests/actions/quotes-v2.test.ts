/**
 * Unit Tests - Quotes V2 Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as quotesV2 from '@/actions/quotes-v2';
import * as dbModule from '@/lib/db';

// Mock dependencies
vi.mock('@/lib/db', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('bcryptjs', () => ({
    default: { compare: vi.fn(async (p: string, h: string) => h === `hashed_${p}`) },
    compare: vi.fn(async (p: string, h: string) => h === `hashed_${p}`)
}));
vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: vi.fn(() => ({ allowed: true })),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn()
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

// Data
const mockQuote = { id: 'quote-1', code: 'COT-001', status: 'PENDING', subtotal: 100000, discount: 0, total: 100000, valid_until: new Date(Date.now() + 86400000) };
const mockItem = { productId: 'prod-1', sku: 'SKU001', name: 'Product', quantity: 2, unitPrice: 10000, discount: 0 };

describe('Quotes V2 - Discount Thresholds', () => {
    it('should allow <= 10% discount without PIN', async () => {
        createMockClient([{ rows: [mockQuote], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 0 }]);
        const result = await quotesV2.applyDiscountSecure({ quoteId: 'quote-1', discountPercent: 10, reason: 'Cliente frecuente' });
        expect(result.success).toBe(true);
    });

    it('should require PIN for 10-20% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({ quoteId: 'quote-1', discountPercent: 15, reason: 'Discount' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('CAJERO');
    });

    it('should require MANAGER PIN for 20-30% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({ quoteId: 'quote-1', discountPercent: 25, reason: 'Bulk' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('MANAGER');
    });

    it('should require GERENTE PIN for > 30% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({ quoteId: 'quote-1', discountPercent: 35, reason: 'Special' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('GERENTE');
    });
});

describe('Quotes V2 - Quote Creation', () => {
    it('should create quote with items', async () => {
        createMockClient([{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 0 }]);
        const result = await quotesV2.createQuoteSecure({ items: [mockItem], validDays: 7 });
        expect(result.success).toBe(true);
        expect(result.quoteCode).toContain('COT-');
    });

    it('should reject empty items', async () => {
        const result = await quotesV2.createQuoteSecure({ items: [], validDays: 7 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('item');
    });
});

describe('Quotes V2 - Conversion', () => {
    it('should reject expired quote', async () => {
        const expired = { ...mockQuote, valid_until: new Date(Date.now() - 86400000) };
        createMockClient([{ rows: [expired], rowCount: 1 }, { rows: [], rowCount: 1 }]);
        const result = await quotesV2.convertToSaleSecure({
            quoteId: 'quote-1', paymentMethod: 'CASH', cashReceived: 100000,
            terminalId: 'term-1', userId: 'user-1'
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('expirada');
    });

    it('should reject already converted quote', async () => {
        const converted = { ...mockQuote, status: 'CONVERTED' };
        createMockClient([{ rows: [converted], rowCount: 1 }]);
        const result = await quotesV2.convertToSaleSecure({
            quoteId: 'quote-1', paymentMethod: 'CASH', cashReceived: 100000,
            terminalId: 'term-1', userId: 'user-1'
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('procesada');
    });
});

function createMockClient(queryResults: any[] = []) {
    let callIndex = 0;
    const mockClient = {
        query: vi.fn((sql: string) => {
            if (sql.includes('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve({});
            return Promise.resolve(callIndex < queryResults.length ? queryResults[callIndex++] : { rows: [], rowCount: 0 });
        }),
        release: vi.fn()
    };
    vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
    return mockClient;
}
