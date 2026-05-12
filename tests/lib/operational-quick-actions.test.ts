import { describe, expect, it } from 'vitest';
import {
    buildOperationalQuickActionHref,
    getOperationalQuickActionHint,
    parseOperationalQuickActionParams,
} from '@/lib/operational-quick-actions';

describe('operational quick actions', () => {
    it('construye hrefs con contexto canonico y fuente auditada', () => {
        const href = buildOperationalQuickActionHref('/reports', {
            startDate: '2026-04-01',
            endDate: '2026-04-20',
            locationId: 'loc-1',
            warehouseId: 'wh-1',
            alertId: 'wms-pending-transfers',
        }, {
            tab: 'logistics',
            detail: 'transfers',
        });

        expect(href).toBe('/reports?startDate=2026-04-01&endDate=2026-04-20&locationId=loc-1&warehouseId=wh-1&source=operational-suggestion&alertId=wms-pending-transfers&tab=logistics&detail=transfers');
    });

    it('parsea hints sin convertirlos en autoridad operativa', () => {
        const params = new URLSearchParams({
            source: 'operational-suggestion',
            alertId: 'inventory-critical-low-stock',
            locationId: 'loc-2',
            warehouseId: 'wh-2',
        });

        const result = parseOperationalQuickActionParams(params);

        expect(result).toMatchObject({
            isOperationalSuggestion: true,
            alertId: 'inventory-critical-low-stock',
            locationId: 'loc-2',
            warehouseId: 'wh-2',
        });
        expect(getOperationalQuickActionHint(result.alertId)?.title).toBe('Preparar pedido por bajo stock');
    });

    it('bloquea modo quick action si falta alertId', () => {
        const result = parseOperationalQuickActionParams(new URLSearchParams({ source: 'operational-suggestion' }));

        expect(result.isOperationalSuggestion).toBe(false);
    });
});
