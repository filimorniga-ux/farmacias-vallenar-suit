import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportLogisticsReportSecure } from '@/actions/finance-export-v2';
import { getSessionSecure } from '@/actions/auth-v2';
import {
    getInventoryValuationSecure,
    getLogisticsKPIsSecure,
    getStockMovementsDetailSecure,
} from '@/actions/reports-detail-v2';

const generateMultiSheetReportMock = vi.hoisted(() => vi.fn());

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
        async generateReport() {
            return Buffer.from('unused');
        }

        async generateMultiSheetReport(...args: unknown[]) {
            return generateMultiSheetReportMock(...args);
        }
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('finance-export-v2 - logistics summary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager Uno',
            tokenVersion: 1,
            sessionToken: 'token',
        } as any);

        vi.mocked(getInventoryValuationSecure).mockResolvedValue({
            success: true,
            data: {
                total_items: 10,
                total_cost_value: 5000,
                total_sales_value: 8000,
                potential_gross_margin: 3000,
                top_products: [
                    { name: 'Producto A', sku: 'A-1', quantity: 3, cost_value: 1500, sales_value: 2400 },
                ],
            },
        } as any);

        vi.mocked(getLogisticsKPIsSecure).mockResolvedValue({
            success: true,
            data: {
                total_in: 4,
                total_out: 2,
                last_movement: '2024-01-31 12:00',
            },
        } as any);

        vi.mocked(getStockMovementsDetailSecure).mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'mov-1',
                    timestamp: new Date('2024-01-10T10:00:00.000Z'),
                    type: 'TRANSFER_IN',
                    product: 'Producto A',
                    quantity: 3,
                    user: 'Operador',
                    reason: 'Recepción',
                    location_context: 'Sucursal Centro',
                },
            ],
        } as any);

        generateMultiSheetReportMock.mockResolvedValue(Buffer.from('excel-logistics'));
    });

    it('exporta logística usando las mismas actions de lectura del tab', async () => {
        const result = await exportLogisticsReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            warehouseId: 'warehouse-1',
            movementType: 'IN',
        });

        expect(result.success).toBe(true);
        expect(getInventoryValuationSecure).toHaveBeenCalledWith('warehouse-1');
        expect(getLogisticsKPIsSecure).toHaveBeenCalledWith('2024-01-01', '2024-01-31', 'warehouse-1');
        expect(getStockMovementsDetailSecure).toHaveBeenCalledWith('IN', '2024-01-01', '2024-01-31', 'warehouse-1');
        expect(generateMultiSheetReportMock).toHaveBeenCalledTimes(1);
    });

    it('omite detalle si el drilldown no está activo', async () => {
        const result = await exportLogisticsReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            warehouseId: 'warehouse-1',
        });

        expect(result.success).toBe(true);
        expect(getStockMovementsDetailSecure).not.toHaveBeenCalled();
    });
});
