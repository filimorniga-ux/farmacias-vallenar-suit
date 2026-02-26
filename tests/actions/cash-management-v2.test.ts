/**
 * Unit Tests - Cash Management V2 Module
 * Refactored with valid UUIDs and proper mock pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cashV2 from '@/actions/cash-management-v2';

// Valid UUIDs
const VALID_UUID_CASHIER = '550e8400-e29b-41d4-a716-446655440010';
const VALID_UUID_MANAGER = '550e8400-e29b-41d4-a716-446655449999';
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

const mockManager = {
    id: VALID_UUID_MANAGER,
    name: 'Manager',
    role: 'MANAGER',
    access_pin_hash: 'hashed_9999',
    is_active: true
};

const mockSession = {
    id: VALID_UUID_SESSION,
    terminal_id: VALID_UUID_TERMINAL,
    opening_amount: 50000,
    opened_at: new Date(),
    user_id: VALID_UUID_CASHIER
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

    it('should reject adjustment when reason is too short', async () => {
        const res = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: 1000,
            reason: 'ok' // 2 chars, min is 3
        } as any);

        expect(res.success).toBe(false);
        expect(res.error).toContain('Motivo requerido');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should allow large adjustment with MANAGER PIN', async () => {
        setupMockQueries([
            { rows: [mockManager] }, // Manager lookup
            { rows: [{ id: VALID_UUID_SESSION, terminal_id: VALID_UUID_TERMINAL, user_id: VALID_UUID_CASHIER, location_id: 'loc-1' }] }, // Session
            { rows: [], rowCount: 1 }, // Movement insert
            { rows: [], rowCount: 1 }, // Audit
        ]);

        const res = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: 75000, // > 50k
            reason: 'Ajuste autorizado manager',
            authorizationPin: '9999'
        });

        expect(res.success).toBe(true);
    });

    it('should allow negative adjustment (withdrawal)', async () => {
        setupMockQueries([
            { rows: [mockSession], rowCount: 1 }, // Session check
            { rows: [], rowCount: 1 },            // Adjustment insert
            { rows: [], rowCount: 1 }             // Audit
        ]);

        const result = await cashV2.adjustCashSecure({
            sessionId: VALID_UUID_SESSION,
            userId: VALID_UUID_CASHIER,
            adjustment: -5000,
            reason: 'Retiro de efectivo'
        });

        expect(result.success).toBe(true);
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

    it('should fail validation when terminalId is invalid', async () => {
        const result = await cashV2.openCashDrawerSecure({
            terminalId: 'invalid',
            userId: VALID_UUID_CASHIER,
            openingAmount: 1000
        } as any);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ID inválido');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle lock not available on open', async () => {
        mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [] })); // BEGIN
        mockQuery.mockImplementationOnce(() => Promise.reject({ code: '55P03' })); // Lock error

        const result = await cashV2.openCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            openingAmount: 50000
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terminal en proceso');
    });

    it('should require a PIN when closing drawer', async () => {
        const result = await cashV2.closeCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            declaredCash: 0
            // No userPin or managerPin provided
        } as any);

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN de usuario o PIN de gerente');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should close drawer with user PIN successfully', async () => {
        setupMockQueries([
            { rows: [mockCashier] }, // User pin check
            { rows: [{ id: VALID_UUID_TERMINAL, location_id: 'loc-1', current_cashier_id: VALID_UUID_CASHIER }] }, // Terminal
            { rows: [{ id: VALID_UUID_SESSION, opening_amount: 10000, opened_at: new Date(), user_id: VALID_UUID_CASHIER }] }, // Session
            { rows: [{ cash_sales: 5000 }] }, // Sales
            { rows: [{ has_refunds: false }] }, // refund ledger check
            { rows: [{ total_in: 0, total_out: 0 }] }, // Movements
            { rows: [] }, // Update session
            { rows: [] }, // Update terminal
            { rows: [] }  // Audit
        ]);

        const res = await cashV2.closeCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            userPin: '1234',
            declaredCash: 15000,
            notes: 'Cierre normal'
        });

        expect(res.success).toBe(true);
        expect(res.summary?.difference).toBe(0);
    });

    it('should close drawer with MANAGER PIN successfully', async () => {
        setupMockQueries([
            { rows: [mockManager] }, // Manager pin check
            { rows: [{ id: VALID_UUID_TERMINAL, location_id: 'loc-1', current_cashier_id: VALID_UUID_CASHIER }] }, // Terminal
            { rows: [{ id: VALID_UUID_SESSION, opening_amount: 10000, opened_at: new Date(), user_id: VALID_UUID_CASHIER }] }, // Session
            { rows: [{ cash_sales: 5000 }] }, // Sales
            { rows: [{ has_refunds: false }] }, // refund ledger check
            { rows: [{ total_in: 0, total_out: 0 }] }, // Movements
            { rows: [] }, // Update session
            { rows: [] }, // Update terminal
            { rows: [] }  // Audit
        ]);

        const res = await cashV2.closeCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            managerPin: '9999',
            declaredCash: 15000,
            notes: 'Cierre por gerente'
        });

        expect(res.success).toBe(true);
        expect(res.summary?.difference).toBe(0);
    });

    it('should handle lock not available on close', async () => {
        setupMockQueries([ // Valid user pin
            { rows: [mockCashier] },
        ]);

        // Then fail lock
        mockQuery.mockImplementationOnce(() => Promise.reject({ code: '55P03' }));

        const result = await cashV2.closeCashDrawerSecure({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_CASHIER,
            userPin: '1234',
            declaredCash: 0
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terminal en proceso');
    });
});

describe('Cash Management V2 - System Operations', () => {

    it('should auto-close system with 0 difference', async () => {
        setupMockQueries([
            { rows: [{ id: VALID_UUID_SESSION, opening_amount: 10000, opened_at: new Date(), user_id: VALID_UUID_CASHIER }] }, // Active Session
            { rows: [{ cash_sales: 5000 }] }, // Sales
            { rows: [{ total_in: 0, total_out: 0 }] }, // Movements
            { rows: [] }, // Update session
            { rows: [] }, // Update terminal
            { rows: [] }, // Audit
            { rows: [{ location_id: 'loc-1' }] } // Location for notify
        ]);

        const res = await cashV2.closeCashDrawerSystem({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_MANAGER,
            reason: 'Cambio de turno forzado'
        });

        expect(res.success).toBe(true);
    });

    it('should return error if no active session', async () => {
        setupMockQueries([
            { rows: [] } // No active session
        ]);

        const res = await cashV2.closeCashDrawerSystem({
            terminalId: VALID_UUID_TERMINAL,
            userId: VALID_UUID_MANAGER,
            reason: 'Error expected'
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('No hay sesión activa');
    });
});

describe('Cash Management V2 - Refund Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('getShiftMetricsSecure debe restar devoluciones por método en breakdown y cash actual', async () => {
        const { query } = await import('@/lib/db');
        const mockDbQuery = vi.mocked(query) as unknown as {
            mockResolvedValueOnce: (value: unknown) => any;
        };

        mockDbQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_UUID_SESSION,
                    terminal_id: VALID_UUID_TERMINAL,
                    opening_amount: 10000,
                    opened_at: new Date(),
                    cashier_name: 'Cajero Test'
                }]
            }) // session
            .mockResolvedValueOnce({
                rows: [
                    { payment_method: 'CASH', count: '1', total: '20000' },
                    { payment_method: 'DEBIT', count: '1', total: '10000' }
                ]
            }) // sales
            .mockResolvedValueOnce({
                rows: [{ has_refunds: true }]
            }) // hasRefundLedger
            .mockResolvedValueOnce({
                rows: [
                    { payment_method: 'CASH', count: '1', total: '5000' },
                    { payment_method: 'DEBIT', count: '1', total: '2000' }
                ]
            }) // refunds
            .mockResolvedValueOnce({
                rows: [{ id: 'm1', type: 'EXTRA_INCOME', amount: 0, reason: null, timestamp: new Date() }]
            }) // movements
            .mockResolvedValueOnce({
                rows: []
            }); // last count

        const res = await cashV2.getShiftMetricsSecure(VALID_UUID_TERMINAL);

        expect(res.success).toBe(true);
        expect(res.data?.cashSales).toBe(15000);
        expect(res.data?.cardSales).toBe(8000);
        const cashRow = res.data?.sales_breakdown.find((r) => r.method === 'CASH');
        const debitRow = res.data?.sales_breakdown.find((r) => r.method === 'DEBIT');
        expect(cashRow?.total).toBe(15000);
        expect(debitRow?.total).toBe(8000);
    });

    it('getCashMovementHistory debe incluir filtro refund_method cuando paymentMethod es tarjeta', async () => {
        const { query } = await import('@/lib/db');
        const mockDbQuery = vi.mocked(query) as unknown as {
            mockResolvedValueOnce: (value: unknown) => any;
            mock: { calls: Array<[unknown, ...unknown[]]> };
        };

        mockDbQuery
            .mockResolvedValueOnce({ rows: [{ has_refunds: true }] }) // hasRefundLedger
            .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count query
            .mockResolvedValueOnce({
                rows: [{
                    id: 'ref-1',
                    type: 'REFUND',
                    amount: -1000,
                    reason: 'Devolución #REF-1',
                    timestamp: new Date(),
                    terminal_id: VALID_UUID_TERMINAL,
                    session_id: VALID_UUID_SESSION,
                    user_name: 'Cajero',
                    authorized_by_name: 'Supervisor',
                    payment_method: 'DEBIT',
                    status: 'COMPLETED',
                    dte_status: null,
                    dte_folio: 'REF-1',
                    customer_name: 'Cliente'
                }]
            }); // history query

        const res = await cashV2.getCashMovementHistory({
            terminalId: VALID_UUID_TERMINAL,
            sessionId: VALID_UUID_SESSION,
            paymentMethod: 'DEBIT',
            page: 1,
            pageSize: 10,
        });

        expect(res.success).toBe(true);
        expect(res.data?.movements[0]?.type).toBe('REFUND');

        const historySql = mockDbQuery.mock.calls[2]?.[0];
        expect(String(historySql)).toContain('r.refund_method =');
    });
});
