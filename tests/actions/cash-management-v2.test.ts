/**
 * Unit Tests - Cash Management V2 Module
 * Refactored with valid UUIDs and proper mock pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cashV2 from '@/actions/cash-management-v2';

// Valid UUIDs
const VALID_UUID_CASHIER = '550e8400-e29b-41d4-a716-446655440010';
const VALID_UUID_SESSION = '550e8400-e29b-41d4-a716-446655440020';
const VALID_UUID_TERMINAL = '550e8400-e29b-41d4-a716-446655440030';

// Mock functions at module level (pattern from wms-v2.test.ts)
const mockQuery = vi.fn();
const mockRelease = vi.fn();

// Mock DB with proper pool.connect pattern
vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => Promise.resolve({
            query: mockQuery,
            release: mockRelease
        }),
        query: vi.fn()
    },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([
        ['x-user-id', VALID_UUID_CASHIER],
        ['x-user-role', 'CASHIER']
    ]))
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
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999') }));

// Data with valid UUIDs
const mockCashier = {
    id: VALID_UUID_CASHIER,
    name: 'Cajero',
    role: 'CASHIER',
    access_pin_hash: 'hashed_1234',
    is_active: true
};

const mockSession = {
    id: VALID_UUID_SESSION,
    terminal_id: VALID_UUID_TERMINAL,
    opening_amount: 50000,
    opened_at: new Date()
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

// Cash Adjustment Tests
describe('Cash Management V2 - Threshold Adjustments', () => {
    it('should allow small adjustment without PIN', async () => {
        setupMockQueries([
            { rows: [mockSession], rowCount: 1 }, // Session check
            { rows: [], rowCount: 1 },            // Adjustment insert
            { rows: [], rowCount: 0 }             // Audit
        ]);

        const result = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: 5000,
            reason: 'Ajuste menor por diferencia de cambio'
        });

        expect(result.success).toBe(true);
    });

    it('should require PIN for adjustments > $10,000', async () => {
        const result = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: 15000,
            reason: 'Ajuste grande'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('$10');
    });

    it('should require MANAGER PIN for adjustments > $50,000', async () => {
        const result = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: 60000,
            reason: 'Ajuste muy grande'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('MANAGER');
    });
});

// Drawer Operations Tests
describe('Cash Management V2 - Drawer Operations', () => {
    it('should reject if drawer already open', async () => {
        setupMockQueries([
            { rows: [{ id: VALID_UUID_TERMINAL, status: 'OPEN' }], rowCount: 1 }
        ]);

        const result = await cashV2.openCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            openingAmount: 50000
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ya está abierta');
    });
});
