/**
 * Unit Tests - Quotes V2 Module
 * Tests de validación básica - Los tests de lógica compleja requieren DB real
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery, mockRelease, PinRbacError } = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockQuery: vi.fn(),
        mockRelease: vi.fn(),
        PinRbacError: MockPinRbacError,
    };
});

import * as quotesV2 from '@/actions/quotes-v2';
import { getActorOrFail, validatePinForRoles } from '@/lib/pin-rbac';

// Valid UUIDs
const VALID_UUID_QUOTE = '550e8400-e29b-41d4-a716-446655440050';
const VALID_UUID_USER = '550e8400-e29b-41d4-a716-446655440051';
const VALID_UUID_PRODUCT = '550e8400-e29b-41d4-a716-446655440052';
const VALID_UUID_LOCATION = '550e8400-e29b-41d4-a716-446655440053';
const VALID_UUID_TERMINAL = '550e8400-e29b-41d4-a716-446655440054';

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
vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    validatePinForRoles: vi.fn(),
    requireRole: vi.fn((actor, allowedRoles) => {
        const normalizedRole = String(actor.role || '').trim().toUpperCase();
        if (!allowedRoles.map((role: string) => String(role).trim().toUpperCase()).includes(normalizedRole)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }
        return { ...actor, role: normalizedRole };
    }),
    normalizeRole: vi.fn((role: string | null | undefined) => String(role || '').trim().toUpperCase()),
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError,
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
    valid_until: new Date(Date.now() + 86400000), // Tomorrow
    location_id: VALID_UUID_LOCATION,
    user_id: VALID_UUID_USER,
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
    vi.mocked(getActorOrFail).mockResolvedValue({
        userId: VALID_UUID_USER,
        role: 'CASHIER',
        locationId: VALID_UUID_LOCATION,
        userName: 'Caja',
        tokenVersion: 1,
        sessionToken: 'token',
    });
    vi.mocked(validatePinForRoles).mockResolvedValue({
        valid: true,
        authorizedBy: {
            id: '550e8400-e29b-41d4-a716-446655440070',
            name: 'Supervisor',
            role: 'MANAGER',
        },
        matchedBy: 'hash',
    });
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
    it('rechaza sin sesión válida', async () => {
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 10,
            reason: 'Cliente frecuente promoción'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

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

    it('usa el helper compartido para validar PIN de descuento por tramo', async () => {
        setupMockQueries([
            { rows: [mockQuote], rowCount: 1 }, // Quote fetch
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 1 }, // Audit
        ]);

        const result = await quotesV2.applyDiscountSecure({
            quoteId: VALID_UUID_QUOTE,
            discountPercent: 25,
            authorizationPin: '1234',
            reason: 'Descuento mayorista'
        });

        expect(result.success).toBe(true);
        expect(validatePinForRoles).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            '1234',
            ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
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
            { rows: [], rowCount: 0 },              // active terminal lookup
            { rows: [{ id: VALID_UUID_PRODUCT, sku: mockItem.sku, name: mockItem.name, canonical_price: 10000 }], rowCount: 1 }, // canonical product
            { rows: [{ seq: '1' }], rowCount: 1 },  // nextval sequence
            { rows: [], rowCount: 1 },              // Insert quote
            { rows: [], rowCount: 1 },              // Insert items
            { rows: [], rowCount: 1 },              // Audit
            { rows: [{ id: VALID_UUID_QUOTE }], rowCount: 1 }, // In-TX verification
            { rows: [{ id: VALID_UUID_QUOTE }], rowCount: 1 }, // After commit verification
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
            terminalId: VALID_UUID_TERMINAL
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
            terminalId: VALID_UUID_TERMINAL
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('procesada');
    });

    it('reserva stock acotado a la sucursal de la cotización', async () => {
        setupMockQueries([
            { rows: [mockQuote], rowCount: 1 }, // quote lock
            { rows: [{ terminal_id: VALID_UUID_TERMINAL }], rowCount: 1 }, // active terminal
            { rows: [{ sku: mockItem.sku, quantity: mockItem.quantity, product_id: mockItem.productId, name: mockItem.name, unit_price: mockItem.unitPrice, discount_percent: mockItem.discount, subtotal: 20000, total: 20000 }], rowCount: 1 }, // items
            { rows: [{ id: 'batch-1', quantity_real: 10 }], rowCount: 1 }, // stock
            { rows: [], rowCount: 1 }, // decrement stock
            { rows: [], rowCount: 1 }, // insert sale
            { rows: [], rowCount: 1 }, // insert sale item
            { rows: [], rowCount: 1 }, // update quote
            { rows: [], rowCount: 1 }, // audit
        ]);

        const result = await quotesV2.convertToSaleSecure({
            quoteId: VALID_UUID_QUOTE,
            paymentMethod: 'CASH',
            cashReceived: 100000,
            terminalId: VALID_UUID_TERMINAL
        });

        expect(result.success).toBe(true);
        const stockCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('FROM inventory_batches')
        );
        expect(stockCall).toBeDefined();
        expect(String(stockCall?.[0])).toContain('location_id::text = $2::text');
        expect(stockCall?.[1]).toContain(VALID_UUID_LOCATION);
    });
});

describe('Quotes V2 - Security hardening', () => {
    it('rechaza detalle sin sesión válida', async () => {
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await quotesV2.getQuoteDetailsSecure(VALID_UUID_QUOTE);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza cotización ajena para un cajero', async () => {
        setupMockQueries([
            {
                rows: [{
                    id: VALID_UUID_QUOTE,
                    status: 'PENDING',
                    location_id: VALID_UUID_LOCATION,
                    user_id: '550e8400-e29b-41d4-a716-446655440088',
                }],
                rowCount: 1,
            },
        ]);

        const result = await quotesV2.getQuoteDetailsSecure(VALID_UUID_QUOTE);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ajena');
    });

    it('rechaza createQuote con locationId manipulado fuera de la sesión', async () => {
        const result = await quotesV2.createQuoteSecure({
            items: [mockItem],
            validDays: 7,
            locationId: '550e8400-e29b-41d4-a716-446655440099',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('otra ubicación');
    });

    it('recalcula el precio canónico y no usa el unitPrice del payload', async () => {
        setupMockQueries([
            { rows: [{ terminal_id: VALID_UUID_TERMINAL }], rowCount: 1 }, // active terminal
            { rows: [{ id: VALID_UUID_PRODUCT, sku: mockItem.sku, name: mockItem.name, canonical_price: 15000 }], rowCount: 1 }, // canonical product
            { rows: [{ seq: '1' }], rowCount: 1 },  // nextval sequence
            { rows: [], rowCount: 1 },              // Insert quote
            { rows: [], rowCount: 1 },              // Insert items
            { rows: [], rowCount: 1 },              // Audit
            { rows: [{ id: VALID_UUID_QUOTE }], rowCount: 1 }, // In-TX verification
        ]);

        const result = await quotesV2.createQuoteSecure({
            items: [{ ...mockItem, unitPrice: 1 }],
            validDays: 7,
            locationId: VALID_UUID_LOCATION,
            terminalId: VALID_UUID_TERMINAL,
        });

        expect(result.success).toBe(true);
        const insertItemCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO quote_items')
        );
        expect(insertItemCall).toBeDefined();
        expect(insertItemCall?.[1]).toContain(15000);
        expect(insertItemCall?.[1]).not.toContain(1);
    });
});
