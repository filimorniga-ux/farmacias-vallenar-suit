/**
 * Unit Tests - Quotes V2 Module
 * Tests de validación básica - Los tests de lógica compleja requieren DB real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as quotesV2 from '@/actions/quotes-v2';

// Valid UUIDs
const VALID_UUID_QUOTE = '550e8400-e29b-41d4-a716-446655440050';
const VALID_UUID_USER = '550e8400-e29b-41d4-a716-446655440051';
const VALID_UUID_PRODUCT = '550e8400-e29b-41d4-a716-446655440052';
const VALID_UUID_LOCATION = '550e8400-e29b-41d4-a716-446655440053';
const VALID_UUID_TERMINAL = '550e8400-e29b-41d4-a716-446655440054';

// Mock functions at module level
const mockQuery = vi.fn();
const mockRelease = vi.fn();

// Mock DB with proper pool.connect pattern
vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => Promise.resolve({
            query: mockQuery,
            release: mockRelease
        }),
        query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 }))
    },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([
        ['x-user-id', VALID_UUID_USER],
        ['x-user-role', 'CASHIER']
    ])),
    cookies: vi.fn(() => ({
        get: vi.fn(() => null)
    }))
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
vi.mock('@/lib/debug-logger', () => ({ debugLog: vi.fn() }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999') }));

// Data with valid UUIDs
const mockQuote = {
    id: VALID_UUID_QUOTE,
    code: 'COT-001',
    status: 'PENDING',
    subtotal: 100000,
    discount: 0,
    total: 100000,
    valid_until: new Date(Date.now() + 86400000) // Tomorrow
};

const mockItem = {
    productId: VALID_UUID_PRODUCT,
    sku: 'SKU001',
    name: 'Product Test',
    quantity: 2,
    unitPrice: 10000,
    discount: 0
};

beforeEach(() => {
    vi.clearAllMocks();
});

// Helper to setup mock query responses
function setupMockQueries(responses: Array<{ rows: any[]; rowCount?: number }>) {
    let callIndex = 0;
    mockQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' ||
            sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve({ rows: [] });
        }
        const response = responses[callIndex] || { rows: [] };
        callIndex++;
        return Promise.resolve({
            rows: response.rows,
            rowCount: response.rowCount ?? response.rows.length
        });
    });
}

// Discount Validation Tests (Validación pura, sin DB)
describe('Quotes V2 - Discount Thresholds', () => {
    it('should require PIN for 10-20% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 15,
            reason: 'Descuento especial'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('CAJERO');
    });

    it('should require MANAGER PIN for 20-30% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 25,
            reason: 'Descuento mayorista'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('MANAGER');
    });

    it('should require GERENTE PIN for > 30% discount', async () => {
        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 35,
            reason: 'Descuento especial gerencia'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('GERENTE');
    });

    it('should allow <= 10% discount without PIN if quote exists', async () => {
        setupMockQueries([
            { rows: [mockQuote], rowCount: 1 }, // Quote fetch (FOR UPDATE)
            { rows: [], rowCount: 1 },          // Update
            { rows: [], rowCount: 0 }           // Audit
        ]);

        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 10,
            reason: 'Cliente frecuente promoción'
        });

        expect(result.success).toBe(true);
    });
});

// Quote Creation Tests
describe('Quotes V2 - Quote Creation', () => {
    it('should reject empty items', async () => {
        const result = await quotesV2.createQuoteSecure({
            items: [],
            validDays: 7,
            locationId: VALID_UUID_LOCATION
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('item');
    });

    it('should create quote with items when DB is mocked correctly', async () => {
        setupMockQueries([
            { rows: [{ seq: '1' }], rowCount: 1 },  // nextval sequence
            { rows: [], rowCount: 1 },              // Insert quote
            { rows: [], rowCount: 1 },              // Insert items
            { rows: [], rowCount: 1 },              // Audit
            { rows: [{ id: VALID_UUID_QUOTE }], rowCount: 1 }, // In-TX verification
        ]);

        const result = await quotesV2.createQuoteSecure({
            items: [mockItem],
            validDays: 7,
            locationId: VALID_UUID_LOCATION
        });

        // Este test puede fallar si la lógica interna es más compleja
        // TODO: Marcar como integration test cuando tengamos DB de tests
        expect(result.success).toBe(true);
        expect(result.quoteCode).toContain('COT-');
    });
});

// Quote Conversion Tests
describe('Quotes V2 - Conversion', () => {
    it('should reject expired quote', async () => {
        const expiredQuote = {
            ...mockQuote,
            valid_until: new Date(Date.now() - 86400000) // Yesterday
        };

        setupMockQueries([
            { rows: [expiredQuote], rowCount: 1 },
        ]);

        const result = await quotesV2.convertToSaleSecure({
            quoteId: VALID_UUID_QUOTE,
            paymentMethod: 'CASH',
            cashReceived: 100000,
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_USER
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('expirada');
    });

    it('should reject already converted quote', async () => {
        const convertedQuote = { ...mockQuote, status: 'CONVERTED' };

        setupMockQueries([
            { rows: [convertedQuote], rowCount: 1 }
        ]);

        const result = await quotesV2.convertToSaleSecure({
            quoteId: VALID_UUID_QUOTE,
            paymentMethod: 'CASH',
            cashReceived: 100000,
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_USER
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('procesada');
    });
});
