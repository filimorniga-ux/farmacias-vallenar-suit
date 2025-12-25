/**
 * Unit Tests - Cash Management V2 Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cashV2 from '@/actions/cash-management-v2';
import * as dbModule from '@/lib/db';

// Mock dependencies
vi.mock('@/lib/db', () => ({
    pool: { connect: vi.fn() },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'cashier-1'], ['x-user-role', 'CASHIER']]))
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
const mockCashier = { id: 'cashier-1', name: 'Cajero', role: 'CASHIER', access_pin_hash: 'hashed_1234', is_active: true };
const mockSession = { id: 'session-1', terminal_id: 'term-1', opening_amount: 50000, opened_at: new Date() };

describe('Cash Management V2 - Threshold Adjustments', () => {
    it('should allow small adjustment without PIN', async () => {
        createMockClient([{ rows: [mockSession], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 0 }]);
        const result = await cashV2.adjustCashSecure({ sessionId: 'session-1', userId: 'cashier-1', adjustment: 5000, reason: 'Minor' });
        expect(result.success).toBe(true);
    });

    it('should require PIN for adjustments > $10,000', async () => {
        const result = await cashV2.adjustCashSecure({ sessionId: 'session-1', userId: 'cashier-1', adjustment: 15000, reason: 'Large' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('$10');
    });

    it('should require MANAGER PIN for adjustments > $50,000', async () => {
        const result = await cashV2.adjustCashSecure({ sessionId: 'session-1', userId: 'cashier-1', adjustment: 60000, reason: 'Very large' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('MANAGER');
    });
});

describe('Cash Management V2 - Drawer Operations', () => {
    it('should reject if drawer already open', async () => {
        createMockClient([{ rows: [{ id: 'term-1', status: 'OPEN' }], rowCount: 1 }]);
        const result = await cashV2.openCashDrawerSecure({ terminalId: 'term-1', userId: 'cashier-1', openingAmount: 50000 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('ya está abierta');
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
