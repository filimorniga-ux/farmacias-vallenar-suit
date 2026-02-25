import { describe, expect, it } from 'vitest';
import { IntelligentOrderingService } from '@/presentation/services/intelligentOrderingService';
import type { AutoOrderSuggestion, InventoryBatch, Supplier } from '@/domain/types';

const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440210';
const SUPPLIER_ID = '550e8400-e29b-41d4-a716-446655440211';
const WAREHOUSE_A = '550e8400-e29b-41d4-a716-446655440212';
const WAREHOUSE_B = '550e8400-e29b-41d4-a716-446655440213';

const supplier: Supplier = {
    id: SUPPLIER_ID,
    rut: '76123456-7',
    business_name: 'Proveedor QA SPA',
    fantasy_name: 'Proveedor QA',
    address: 'Calle Falsa 123',
    region: 'Atacama',
    city: 'Vallenar',
    commune: 'Vallenar',
    phone_1: '+56911111111',
    contact_email: 'qa@proveedor.cl',
    email_orders: 'ordenes@proveedor.cl',
    email_billing: 'facturas@proveedor.cl',
    contacts: [],
    sector: 'Distribuidora',
    brands: ['Marca QA'],
    categories: ['MEDICAMENTOS'],
    payment_terms: '30_DIAS',
    rating: 4,
    lead_time_days: 3,
};

const baseBatch: InventoryBatch = {
    id: '550e8400-e29b-41d4-a716-446655440300',
    product_id: '550e8400-e29b-41d4-a716-446655440301',
    sku: 'SKU-A',
    name: 'Producto A',
    concentration: '500mg',
    unit_count: 1,
    is_generic: false,
    bioequivalent_status: 'NO_BIOEQUIVALENTE',
    condition: 'VD',
    location_id: LOCATION_ID,
    stock_actual: 10,
    stock_min: 5,
    stock_max: 30,
    expiry_date: Date.now() + 10_000_000,
    cost_net: 1000,
    tax_percent: 19,
    price_sell_box: 1500,
    price_sell_unit: 1500,
    price: 1500,
    cost_price: 1000,
    category: 'MEDICAMENTO',
    allows_commission: false,
    active_ingredients: ['COMPUESTO A'],
};

const makeBatch = (overrides: Partial<InventoryBatch>): InventoryBatch => ({
    ...baseBatch,
    ...overrides,
});

const baseSuggestion: AutoOrderSuggestion = {
    sku: 'SKU-A',
    product_name: 'Producto A',
    location_id: LOCATION_ID,
    current_stock: 4,
    min_stock: 5,
    max_stock: 30,
    daily_avg_sales: 2,
    forecast_demand_14d: 28,
    days_until_stockout: 2,
    suggested_order_qty: 20,
    urgency: 'HIGH',
    reason: 'Stock bajo',
    supplier_id: SUPPLIER_ID,
    unit_cost: 1100,
};

const makeSuggestion = (overrides: Partial<AutoOrderSuggestion>): AutoOrderSuggestion => ({
    ...baseSuggestion,
    ...overrides,
});

describe('IntelligentOrderingService.generateSuggestedPOs', () => {
    it('usa la bodega del SKU sugerido cuando existe en inventario', () => {
        const suggestions = [
            makeSuggestion({ sku: 'SKU-A', product_name: 'Producto A' }),
            makeSuggestion({ sku: 'SKU-B', product_name: 'Producto B' }),
        ];

        const inventory = [
            makeBatch({ sku: 'SKU-A', warehouse_id: WAREHOUSE_A }),
            makeBatch({ sku: 'SKU-B', warehouse_id: WAREHOUSE_B }),
        ];

        const pos = IntelligentOrderingService.generateSuggestedPOs(suggestions, [supplier], inventory);

        expect(pos).toHaveLength(1);
        expect(pos[0].target_warehouse_id).toBe(WAREHOUSE_A);
    });

    it('si no existe bodega para el SKU, usa bodega disponible por ubicación', () => {
        const suggestions = [
            makeSuggestion({ sku: 'SKU-NO-EXISTE', product_name: 'Producto X' }),
        ];

        const inventory = [
            makeBatch({ sku: 'SKU-A', warehouse_id: WAREHOUSE_B }),
        ];

        const pos = IntelligentOrderingService.generateSuggestedPOs(suggestions, [supplier], inventory);

        expect(pos).toHaveLength(1);
        expect(pos[0].target_warehouse_id).toBe(WAREHOUSE_B);
    });

    it('si no hay warehouse_id en inventario, conserva fallback a location_id', () => {
        const suggestions = [
            makeSuggestion({ sku: 'SKU-A', product_name: 'Producto A' }),
        ];

        const inventory = [
            makeBatch({ sku: 'SKU-A', warehouse_id: undefined }),
        ];

        const pos = IntelligentOrderingService.generateSuggestedPOs(suggestions, [supplier], inventory);

        expect(pos).toHaveLength(1);
        expect(pos[0].target_warehouse_id).toBe(LOCATION_ID);
    });
});
