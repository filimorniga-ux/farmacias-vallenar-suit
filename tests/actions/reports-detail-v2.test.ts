import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportsV2 from '@/actions/reports-detail-v2';
import * as dbModule from '@/lib/db';
import { getActorOrFail, validatePinForRoles } from '@/lib/pin-rbac';
import { getSessionSecure } from '@/actions/auth-v2';

const { PinRbacError } = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        PinRbacError: MockPinRbacError,
    };
});

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(() => ({
            query: vi.fn(),
            release: vi.fn(),
        }))
    }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    normalizeRole: vi.fn((role?: string) => String(role || '').trim().toUpperCase()),
    requireRole: vi.fn((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }

        return actor;
    }),
    validatePinForRoles: vi.fn(),
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError,
}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionSecure).mockResolvedValue({
        userId: 'user-1',
        role: 'MANAGER',
        locationId: 'loc-1',
        userName: 'Manager Uno',
        tokenVersion: 1,
        sessionToken: 'token',
    });
    vi.mocked(getActorOrFail).mockResolvedValue({
        userId: 'user-1',
        role: 'MANAGER',
        locationId: 'loc-1',
        userName: 'Manager Uno',
        tokenVersion: 1,
        sessionToken: 'token',
    });
    vi.mocked(validatePinForRoles).mockResolvedValue({
        valid: true,
        authorizedBy: {
            id: 'admin-pin-1',
            name: 'Admin Pin',
            role: 'ADMIN',
        },
        matchedBy: 'hash',
    });
});

describe('Reports V2 - Cash Flow', () => {
    it('should success and return mapped data', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [
                { id: '1', timestamp: Date.now(), description: 'Venta', category: 'SALE', amount_in: 100, amount_out: 0, user_name: 'Test' }
            ],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });

        expect(result.success).toBe(true);
        expect(result.data?.[0].amount_in).toBe(100);
        expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), expect.any(Array));
    });

    it('should use cache for subsequent requests', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [], rowCount: 0, command: '', oid: 0, fields: []
        });

        // First call
        await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01' });
        const callCount = vi.mocked(dbModule.query).mock.calls.length;

        // Second call (same params)
        await reportsV2.getCashFlowLedgerSecure({ startDate: '2024-01-01' });
        expect(vi.mocked(dbModule.query).mock.calls.length).toBe(callCount); // No increase
    });

    it('should force locationId for non-admin managers', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [], rowCount: 0, command: '', oid: 0, fields: []
        });

        await reportsV2.getCashFlowLedgerSecure({ locationId: 'other-loc' });

        // Should find the data retrieval call (not the audit call)
        const dataCall = vi.mocked(dbModule.query).mock.calls.find(call =>
            call[0].includes('SELECT') && call[1]?.includes('loc-1')
        );

        expect(dataCall).toBeDefined();
        expect(dataCall![1]).not.toContain('other-loc');
    });

    it('should require MANAGER role for cash flow access', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await reportsV2.getCashFlowLedgerSecure({});
        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });
});

describe('Reports V2 - Tax Summary', () => {
    it('should calculate taxes correctly', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total: 119000 }], rowCount: 1, command: '', oid: 0, fields: []
        }); // Sales
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total: 0 }], rowCount: 1, command: '', oid: 0, fields: []
        }); // Refunds
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total: 59500 }], rowCount: 1, command: '', oid: 0, fields: []
        }); // Purchases

        vi.mocked(getSessionSecure).mockResolvedValueOnce({
            userId: 'user-c',
            role: 'CONTADOR',
            locationId: 'loc-1',
            userName: 'Contador Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await reportsV2.getTaxSummarySecure('2024-01');

        expect(result.success).toBe(true);
        expect(result.data.total_net_sales).toBe(100000); // 119000 / 1.19
        expect(result.data.total_vat_debit).toBe(19000);
        expect(result.data.estimated_tax_payment).toBe(19000 - 9500);
    });
});

describe('Reports V2 - Inventory Valuation', () => {
    it('should return totals for scoped location when manager has no explicit warehouse', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ total_units: 50, total_cost: 5000, total_sale: 8000 }],
            rowCount: 1, command: '', oid: 0, fields: []
        }).mockResolvedValueOnce({
            rows: [],
            rowCount: 1, command: 'INSERT', oid: 0, fields: []
        });

        const result = await reportsV2.getInventoryValuationSecure();
        expect(result.success).toBe(true);
        expect(result.data.total_items).toBe(50);
        expect(result.data.potential_gross_margin).toBe(3000);

        const sql = String(vi.mocked(dbModule.query).mock.calls[0]?.[0] || '');
        const params = (vi.mocked(dbModule.query).mock.calls[0]?.[1] || []) as unknown[];

        expect(sql).toContain('JOIN warehouses w ON ib.warehouse_id::text = w.id::text');
        expect(sql).toContain('w.location_id::text = $1::text');
        expect(params[0]).toBe('loc-1');
    });

    it('should deny warehouse from another location to non-global manager', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ location_id: 'loc-2' }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: []
        });

        const result = await reportsV2.getInventoryValuationSecure('warehouse-foreign');

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
    });
});

describe('Reports V2 - Financial Scope', () => {
    it('should scope financial summary to manager location', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{ total: 1000 }], rowCount: 1, command: 'SELECT', oid: 0, fields: []
            })
            .mockResolvedValueOnce({
                rows: [{ total: 100 }], rowCount: 1, command: 'SELECT', oid: 0, fields: []
            })
            .mockResolvedValueOnce({
                rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: []
            })
            .mockResolvedValueOnce({
                rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: []
            });

        const result = await reportsV2.getDetailedFinancialSummarySecure('2024-01-01', '2024-01-31');

        expect(result.success).toBe(true);

        const salesCall = vi.mocked(dbModule.query).mock.calls.find(([sql]) =>
            String(sql).includes('FROM sales')
        );
        const refundsCall = vi.mocked(dbModule.query).mock.calls.find(([sql]) =>
            String(sql).includes('FROM refunds')
        );
        const cashMovementsCall = vi.mocked(dbModule.query).mock.calls.find(([sql]) =>
            String(sql).includes('FROM cash_movements')
        );

        expect(String(salesCall?.[0] || '')).toContain('location_id::text = $3::text');
        expect(String(refundsCall?.[0] || '')).toContain('location_id::text = $3::text');
        expect(String(cashMovementsCall?.[0] || '')).toContain('location_id::text = $3::text');
        expect((salesCall?.[1] || [])[2]).toBe('loc-1');
    });
});

describe('Reports V2 - Logistics Scope', () => {
    it('should deny cross-location filter for logistics KPIs', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ location_id: 'loc-2' }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: []
        });

        const result = await reportsV2.getLogisticsKPIsSecure('2024-01-01', '2024-01-31', 'warehouse-foreign');

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
    });

    it('should allow global admin access to another location for stock movements', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            userName: 'Admin Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{ location_id: 'loc-2' }],
                rowCount: 1, command: 'SELECT', oid: 0, fields: []
            })
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'mov-1',
                        timestamp: new Date('2024-01-05T10:00:00.000Z'),
                        movement_type: 'TRANSFER_OUT',
                        quantity: -2,
                        product_name: 'Producto Test',
                        sku: 'SKU-1',
                        user_name: 'Operador',
                        reason: 'Ajuste',
                    },
                ],
                rowCount: 1, command: 'SELECT', oid: 0, fields: []
            })
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 1, command: 'INSERT', oid: 0, fields: []
            });

        const result = await reportsV2.getStockMovementsDetailSecure(
            'ALL',
            '2024-01-01',
            '2024-01-31',
            'warehouse-global',
        );

        expect(result.success).toBe(true);
        expect(result.data?.[0].id).toBe('mov-1');
    });
});

describe('Reports V2 - Payroll', () => {
    it('should require ADMIN role for payroll', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '1234');
        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require PIN for payroll access even if ADMIN', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'admin-session',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '');
        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('should allow access with correct PIN', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'admin-session',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };
        vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);

        mockClient.query
            .mockResolvedValueOnce({ rows: [], command: 'BEGIN', rowCount: 0 }) // BEGIN
            .mockResolvedValueOnce({ // users data
                rows: [{ id: 'emp-1', rut: '1-1', name: 'Emp 1', base_salary: 500000 }],
                rowCount: 1
            })
            .mockResolvedValueOnce({ rows: [], command: 'INSERT', rowCount: 1 }) // audit
            .mockResolvedValueOnce({ rows: [], command: 'COMMIT', rowCount: 0 }); // COMMIT

        const result = await reportsV2.getPayrollPreviewSecure(1, 2024, '1234');
        expect(result.success).toBe(true);
        expect(result.data?.[0].base_salary).toBe(500000);
        expect(validatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['admin-session'])
        );
    });
});
