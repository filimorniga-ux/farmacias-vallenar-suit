import { describe, expect, it } from 'vitest';
import {
    DEFAULT_WAREHOUSE_FALLBACK_ID,
    isValidUuid,
    resolveManualOrderIds,
    shouldSyncMasterCost
} from '@/presentation/components/supply/manualOrderUtils';

describe('manualOrderUtils', () => {
    const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

    it('valida UUID correctamente', () => {
        expect(isValidUuid(VALID_UUID)).toBe(true);
        expect(isValidUuid('PO-AUTO-123')).toBe(false);
    });

    it('normaliza supplier y warehouse para evitar Invalid UUID', () => {
        expect(resolveManualOrderIds({
            selectedSupplierId: 'TRANSFER',
            currentWarehouseId: 'warehouse-text'
        })).toEqual({
            supplierId: null,
            warehouseId: DEFAULT_WAREHOUSE_FALLBACK_ID
        });

        expect(resolveManualOrderIds({
            selectedSupplierId: VALID_UUID,
            currentWarehouseId: VALID_UUID
        })).toEqual({
            supplierId: VALID_UUID,
            warehouseId: VALID_UUID
        });
    });

    it('sincroniza costo maestro solo con productId UUID y costo modificado', () => {
        expect(shouldSyncMasterCost({
            productId: VALID_UUID,
            cost_price: 1200,
            original_cost: 1000
        })).toBe(true);

        expect(shouldSyncMasterCost({
            productId: '50067',
            cost_price: 1200,
            original_cost: 1000
        })).toBe(false);

        expect(shouldSyncMasterCost({
            productId: VALID_UUID,
            cost_price: 1000,
            original_cost: 1000
        })).toBe(false);
    });
});
