import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dashboardV2 from '@/actions/dashboard-v2';
import * as dbModule from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const queryResult = (rows: Record<string, unknown>[]) => ({
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'ADMIN',
        locationId: 'loc-1',
        userName: 'Admin',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

describe('Dashboard V2 - Authentication', () => {
    it('should require authentication', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-03-01T00:00:00Z'), to: new Date('2024-03-02T00:00:00Z') }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Dashboard V2 - RBAC', () => {
    it('should restrict CASHIER to their terminal only', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CAJERO',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
            command: '',
            oid: 0,
            fields: [],
        });

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-04-01T00:00:00Z'), to: new Date('2024-04-02T00:00:00Z') }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('terminal');
    });

    it('ignora el terminal solicitado por cliente y usa la sesión activa del cajero', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            role: 'CAJERO',
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{ terminal_id: '550e8400-e29b-41d4-a716-446655440010', location_id: '550e8400-e29b-41d4-a716-446655440001' }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            })
            .mockResolvedValue({
                rows: [{ total_sales: 1000, total: 1000, count: 5, cash: 500, debit: 300, credit: 200, transfer: 0 }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            });

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-05-01T00:00:00Z'), to: new Date('2024-05-02T00:00:00Z') },
            terminalId: '550e8400-e29b-41d4-a716-446655440099',
        });

        expect(result.success).toBe(true);

        const auditCall = vi.mocked(dbModule.query).mock.calls.find((call) =>
            String(call[0]).includes("INSERT INTO audit_log")
        );
        expect(auditCall).toBeDefined();
        const auditPayload = JSON.parse(String(auditCall?.[1]?.[1] || '{}')) as { terminal_id?: string };
        expect(auditPayload.terminal_id).toBe('550e8400-e29b-41d4-a716-446655440010');
    });
});

describe('Dashboard V2 - Financial Metrics', () => {
    it('should return metrics for admin', async () => {
        vi.mocked(dbModule.query).mockResolvedValue({
            rows: [{ total_sales: 1000, total: 1000, count: 5, cash: 500, debit: 300, credit: 200, transfer: 0 }],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-01-01T00:00:00Z'), to: new Date('2024-01-02T00:00:00Z') }
        });

        expect(result.success).toBe(true);
        expect(result.data?.summary.total_sales).toBe(1000);
    });

    it('should handle database errors gracefully', async () => {
        vi.mocked(dbModule.query).mockRejectedValue(new Error('DB Fail'));

        const result = await dashboardV2.getFinancialMetricsSecure({
            dateRange: { from: new Date('2024-02-01T00:00:00Z'), to: new Date('2024-02-02T00:00:00Z') }
        });

        expect(result.success).toBe(false);
        expect(result.error?.toLowerCase()).toContain('error');
    });
});

describe('Dashboard V2 - Executive gross profit contract', () => {
    it('no usa fallback silencioso de 30% cuando faltan costos unitarios', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'exec-missing-costs',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(dbModule.query)
            .mockResolvedValueOnce(queryResult([{ total: '100000', count: '10' }]))
            .mockResolvedValueOnce(queryResult([{ total: '80000', count: '8' }]))
            .mockResolvedValueOnce(queryResult([{ total_lines: '2', costed_lines: '0', cost: '0' }]))
            .mockResolvedValueOnce(queryResult([{ name: 'Sucursal Centro', total: '100000' }]))
            .mockResolvedValueOnce(queryResult([]));

        const result = await dashboardV2.getExecutiveDashboardMetricsSecure();

        expect(result.success).toBe(true);
        expect(result.data?.grossProfit.confidence).toBe('unavailable');
        expect(result.data?.grossProfit.value).toBeNull();
        expect(result.data?.grossProfit.margin).toBeNull();
        expect(result.data?.grossProfit.reason).toContain('Costos unitarios incompletos');
        expect(result.data?.grossProfit.costCoverage).toEqual({
            costedLines: 0,
            totalLines: 2,
            complete: false,
        });
    });

    it('marca margen bruto como production-safe solo con cobertura completa de costos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'exec-complete-costs',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(dbModule.query)
            .mockResolvedValueOnce(queryResult([{ total: '100000', count: '10' }]))
            .mockResolvedValueOnce(queryResult([{ total: '90000', count: '9' }]))
            .mockResolvedValueOnce(queryResult([{ total_lines: '2', costed_lines: '2', cost: '70000' }]))
            .mockResolvedValueOnce(queryResult([{ name: 'Sucursal Centro', total: '100000' }]))
            .mockResolvedValueOnce(queryResult([]));

        const result = await dashboardV2.getExecutiveDashboardMetricsSecure();

        expect(result.success).toBe(true);
        expect(result.data?.grossProfit.confidence).toBe('production-safe');
        expect(result.data?.grossProfit.value).toBe(30000);
        expect(result.data?.grossProfit.margin).toBe(30);
        expect(result.data?.grossProfit.costCoverage.complete).toBe(true);
    });
});
