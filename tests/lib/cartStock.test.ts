import { describe, expect, it } from 'vitest';
import { resolveCartBatchIds, buildSoldQuantityByBatch } from '@/domain/logic/cartStock';
import { InventoryBatch } from '@/domain/types';

const buildBatch = (overrides: Partial<InventoryBatch>): InventoryBatch => ({
    id: '550e8400-e29b-41d4-a716-446655440010',
    product_id: 'prod-1',
    sku: 'SKU-BASE',
    name: 'Producto Base',
    concentration: '',
    unit_count: 1,
    is_generic: false,
    bioequivalent_status: 'NO_BIOEQUIVALENTE',
    condition: 'VD',
    location_id: 'loc-1',
    stock_actual: 10,
    stock_min: 1,
    stock_max: 100,
    expiry_date: 1735689600000,
    cost_net: 1000,
    tax_percent: 19,
    price_sell_box: 1500,
    price_sell_unit: 1500,
    price: 1500,
    cost_price: 1000,
    category: 'MEDICAMENTOS',
    allows_commission: false,
    active_ingredients: [],
    ...overrides,
});

describe('cartStock', () => {
    it('mantiene batch_id del lote al detal para descontar stock correcto', () => {
        const retailLot = buildBatch({
            id: '550e8400-e29b-41d4-a716-446655440020',
            is_retail_lot: true,
            original_batch_id: '550e8400-e29b-41d4-a716-446655440021',
        });

        const result = resolveCartBatchIds(retailLot);

        expect(result.batchId).toBe('550e8400-e29b-41d4-a716-446655440020');
        expect(result.originalBatchId).toBe('550e8400-e29b-41d4-a716-446655440021');
    });

    it('usa original_batch_id como fallback cuando el id no es UUID', () => {
        const groupedItem = buildBatch({
            id: 'prod-1::DETAIL',
            is_retail_lot: true,
            original_batch_id: '550e8400-e29b-41d4-a716-446655440030',
        });

        const result = resolveCartBatchIds(groupedItem);

        expect(result.batchId).toBe('550e8400-e29b-41d4-a716-446655440030');
        expect(result.originalBatchId).toBeUndefined();
    });

    it('construye mapa por batch y omite items manuales', () => {
        const soldByBatch = buildSoldQuantityByBatch([
            { batch_id: '550e8400-e29b-41d4-a716-446655440040', quantity: 2 },
            { batch_id: '550e8400-e29b-41d4-a716-446655440040', quantity: 3 },
            { batch_id: 'MANUAL', quantity: 5 },
            { batch_id: 'manual-123', quantity: 8 },
        ]);

        expect(soldByBatch.get('550e8400-e29b-41d4-a716-446655440040')).toBe(5);
        expect(soldByBatch.size).toBe(1);
    });
});
