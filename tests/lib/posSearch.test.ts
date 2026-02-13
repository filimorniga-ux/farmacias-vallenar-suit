import { describe, expect, it } from 'vitest';
import { InventoryBatch } from '@/domain/types';
import { buildPOSCatalog, filterInventoryForPOS, selectRetailLotCandidate, sortInventoryForPOS } from '@/domain/logic/posSearch';

const buildBatch = (overrides: Partial<InventoryBatch>): InventoryBatch => ({
    id: 'batch-1',
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

describe('posSearch', () => {
    it('ordena inventario por FEFO', () => {
        const late = buildBatch({ id: 'late', expiry_date: 3000 });
        const early = buildBatch({ id: 'early', expiry_date: 1000 });
        const middle = buildBatch({ id: 'middle', expiry_date: 2000 });

        const result = sortInventoryForPOS([late, middle, early]);

        expect(result.map(item => item.id)).toEqual(['early', 'middle', 'late']);
    });

    it('sin término de búsqueda devuelve todo el inventario (sin tope de 400)', () => {
        const inventory = Array.from({ length: 450 }, (_, idx) =>
            buildBatch({
                id: `batch-${idx + 1}`,
                name: `Producto ${idx + 1}`,
                sku: `SKU-${idx + 1}`,
            })
        );

        const result = filterInventoryForPOS(inventory, '');

        expect(result).toHaveLength(450);
        expect(result[0].id).toBe('batch-1');
        expect(result[449].id).toBe('batch-450');
    });

    it('permite buscar por número de lote', () => {
        const inventory = [
            buildBatch({ id: 'a', lot_number: 'LOT-001-ABC' }),
            buildBatch({ id: 'b', lot_number: 'LOT-002-XYZ' }),
        ];

        const result = filterInventoryForPOS(inventory, '002-xyz');

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('b');
    });

    it('permite buscar por código de barras de forma case-insensitive', () => {
        const inventory = [
            buildBatch({ id: 'a', barcode: '7801234567890' }),
            buildBatch({ id: 'b', barcode: 'ABC-RET-001' }),
        ];

        const result = filterInventoryForPOS(inventory, 'abc-ret');

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('b');
    });

    it('consolida lotes del mismo producto y suma su stock', () => {
        const inventory = sortInventoryForPOS([
            buildBatch({
                id: 'lote-cero',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'INI-2025',
                expiry_date: 1000,
                stock_actual: 0,
            }),
            buildBatch({
                id: 'lote-diez-a',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'PRUEBA',
                expiry_date: 2000,
                stock_actual: 10,
            }),
            buildBatch({
                id: 'lote-diez-b',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'INI-2025-B',
                expiry_date: 3000,
                stock_actual: 10,
            }),
        ]);

        const catalog = buildPOSCatalog(inventory);

        expect(catalog).toHaveLength(1);
        expect(catalog[0].stock_actual).toBe(20);
        expect(catalog[0].id).toBe('lote-diez-a');
    });

    it('si busca por lote, incluye el producto y mantiene stock consolidado', () => {
        const inventory = sortInventoryForPOS([
            buildBatch({
                id: 'lote-cero',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'INI-2025',
                expiry_date: 1000,
                stock_actual: 0,
            }),
            buildBatch({
                id: 'lote-diez-a',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'PRUEBA',
                expiry_date: 2000,
                stock_actual: 10,
            }),
            buildBatch({
                id: 'lote-diez-b',
                product_id: 'prod-10vits',
                sku: '50000',
                name: '10VITS',
                lot_number: 'INI-2025-B',
                expiry_date: 3000,
                stock_actual: 10,
            }),
        ]);

        const catalog = buildPOSCatalog(inventory);
        const filteredByRepresentative = filterInventoryForPOS(catalog, 'prueba');
        const filteredByAnotherLot = filterInventoryForPOS(catalog, 'ini-2025-b');

        expect(filteredByRepresentative).toHaveLength(1);
        expect(filteredByRepresentative[0].stock_actual).toBe(20);
        expect(filteredByRepresentative[0].id).toBe('lote-diez-a');
        expect(filteredByAnotherLot).toHaveLength(1);
        expect(filteredByAnotherLot[0].id).toBe('lote-diez-a');
    });

    it('selecciona lote al detal por product_id y con stock disponible', () => {
        const sourceBox = buildBatch({
            id: 'box-1',
            product_id: 'prod-1',
            sku: 'SKU-1',
            is_retail_lot: false,
            stock_actual: 5,
        });
        const retailNoStock = buildBatch({
            id: 'retail-0',
            product_id: 'prod-1',
            sku: 'SKU-1',
            is_retail_lot: true,
            stock_actual: 0,
            expiry_date: 1000,
        });
        const retailStockA = buildBatch({
            id: 'retail-a',
            product_id: 'prod-1',
            sku: 'SKU-1',
            is_retail_lot: true,
            stock_actual: 4,
            expiry_date: 3000,
        });
        const retailStockB = buildBatch({
            id: 'retail-b',
            product_id: 'prod-1',
            sku: 'SKU-1',
            is_retail_lot: true,
            stock_actual: 7,
            expiry_date: 2000,
        });

        const result = selectRetailLotCandidate(
            [sourceBox, retailNoStock, retailStockA, retailStockB],
            sourceBox
        );

        expect(result?.id).toBe('retail-b');
    });

    it('si el origen ya es detal no propone cambio', () => {
        const retail = buildBatch({
            id: 'retail-1',
            product_id: 'prod-1',
            sku: 'SKU-1',
            is_retail_lot: true,
            stock_actual: 3,
        });

        const result = selectRetailLotCandidate([retail], retail);

        expect(result).toBeUndefined();
    });
});
