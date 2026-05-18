import { describe, expect, it } from 'vitest';
import { buildAnalyticsDrilldownHref } from '@/presentation/lib/analytics-report-drilldown';

describe('analytics report drill-down URLs', () => {
    it('construye links de ventas con filtros canónicos', () => {
        const href = buildAnalyticsDrilldownHref('sales-products', {
            startDate: '2026-04-01',
            endDate: '2026-04-19',
            locationId: 'loc-1',
        });

        expect(href).toBe('/reports/sales-by-product?startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1');
    });

    it('separa drill-downs operativos por dominio sin agregar KPIs nuevos', () => {
        const filters = {
            startDate: '2026-04-01',
            endDate: '2026-04-19',
            locationId: 'loc-1',
            warehouseId: 'wh-1',
        };

        expect(buildAnalyticsDrilldownHref('cash', filters)).toBe('/reports?tab=cash&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1&warehouseId=wh-1');
        expect(buildAnalyticsDrilldownHref('inventory-low-stock', filters)).toBe('/reports?tab=inventory&detail=low-stock&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1&warehouseId=wh-1');
        expect(buildAnalyticsDrilldownHref('procurement-orders', filters)).toBe('/reports?tab=procurement&detail=open-orders&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1&warehouseId=wh-1');
        expect(buildAnalyticsDrilldownHref('wms-transfers', filters)).toBe('/reports?tab=logistics&detail=transfers&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1&warehouseId=wh-1');
        expect(buildAnalyticsDrilldownHref('wms-receptions', filters)).toBe('/reports?tab=logistics&detail=receptions&startDate=2026-04-01&endDate=2026-04-19&locationId=loc-1&warehouseId=wh-1');
    });
});
