import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCashFlowSecure } from '@/actions/finance-export-v2';
import { getSessionSecure } from '@/actions/auth-v2';
import { getCashFlowLedgerSecure } from '@/actions/reports-detail-v2';

const generateReportMock = vi.hoisted(() => vi.fn());

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

vi.mock('@/actions/reports-detail-v2', () => ({
    getCashFlowLedgerSecure: vi.fn(),
    getTaxSummarySecure: vi.fn(),
    getPayrollPreviewSecure: vi.fn(),
    getInventoryValuationSecure: vi.fn(),
    getLogisticsKPIsSecure: vi.fn(),
    getStockMovementsDetailSecure: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        async generateReport(...args: unknown[]) {
            return generateReportMock(...args);
        }
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Finance Export V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'u1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(getCashFlowLedgerSecure).mockResolvedValue({
            success: true,
            data: [
                {
                    id: '1',
                    timestamp: Date.now(),
                    description: 'Venta',
                    category: 'SALE',
                    amount_in: 100,
                    amount_out: 0,
                    user_name: 'Test',
                },
            ],
        } as any);

        generateReportMock.mockResolvedValue(Buffer.from('cash-flow'));
    });

    it('exporta flujo de caja usando la misma action de lectura', async () => {
        const result = await exportCashFlowSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('string');
        expect(result.filename).toContain('Flujo');
        expect(getCashFlowLedgerSecure).toHaveBeenCalledWith({ startDate: '2024-01-01', endDate: '2024-01-31' });
    });

    it('falla autenticación si no hay sesión', async () => {
        vi.mocked(getSessionSecure).mockResolvedValueOnce(null);
        const result = await exportCashFlowSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});
