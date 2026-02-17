
import { IntelligentOrderingService } from '../presentation/services/intelligentOrderingService';
import { AutoOrderSuggestion, Supplier, InventoryBatch } from '../domain/types';

const mockSuppliers: Supplier[] = [
    {
        id: 'sup-1',
        rut: '12.345.678-9',
        business_name: 'Pharma Dist',
        fantasy_name: 'Pharma Dist',
        address: 'Av Test 123',
        region: 'Test Region',
        city: 'Test City',
        commune: 'Test Commune',
        phone_1: '+56912345678',
        contact_email: 'test@example.com',
        email_orders: 'orders@example.com',
        email_billing: 'billing@example.com',
        contacts: [],
        sector: 'Laboratorio',
        brands: [],
        categories: ['MEDICAMENTOS'],
        payment_terms: '30_DIAS',
        rating: 5,
        lead_time_days: 1
    }
];

const mockInventory: InventoryBatch[] = [];

const mockSuggestions: AutoOrderSuggestion[] = [
    {
        sku: 'SKU-1',
        product_name: 'Paracetamol',
        location_id: 'LOC-1',
        current_stock: 10,
        min_stock: 20,
        max_stock: 100,
        daily_avg_sales: 5,
        forecast_demand_14d: 70,
        days_until_stockout: 2,
        suggested_order_qty: 90,
        urgency: 'HIGH',
        reason: 'Low Stock',
        supplier_id: 'sup-1', // Assigned
        unit_cost: 100,
        estimated_cost: 9000
    },
    {
        sku: 'SKU-2',
        product_name: 'Ibuprofeno',
        location_id: 'LOC-1',
        current_stock: 5,
        min_stock: 20,
        max_stock: 100,
        daily_avg_sales: 5,
        forecast_demand_14d: 70,
        days_until_stockout: 1,
        suggested_order_qty: 95,
        urgency: 'HIGH',
        reason: 'Low Stock',
        supplier_id: '', // Empty - UNASSIGNED
        unit_cost: 150,
        estimated_cost: 14250
    },
    {
        sku: 'SKU-3',
        product_name: 'Aspirina',
        location_id: 'LOC-1',
        current_stock: 0,
        min_stock: 20,
        max_stock: 100,
        daily_avg_sales: 5,
        forecast_demand_14d: 70,
        days_until_stockout: 0,
        suggested_order_qty: 100,
        urgency: 'HIGH',
        reason: 'Out of Stock',
        supplier_id: undefined, // Undefined - UNASSIGNED
        unit_cost: 50,
        estimated_cost: 5000
    }
];

async function main() {
    console.log('🧪 Verifying IntelligentOrderingService...');

    const pos = IntelligentOrderingService.generateSuggestedPOs(mockSuggestions, mockSuppliers, mockInventory);

    console.log(`✅ Generated ${pos.length} Purchase Orders`);

    const assignedPO = pos.find(p => p.supplier_id === 'sup-1');
    const unassignedPO = pos.find(p => p.supplier_id === null || p.supplier_id === undefined);

    if (assignedPO) {
        console.log(`✅ Assigned PO found: ${assignedPO.id} with ${assignedPO.items.length} items`);
        if (assignedPO.items.length !== 1) console.error('❌ Expected 1 item in assigned PO');
    } else {
        console.error('❌ Assigned PO not found');
    }

    if (unassignedPO) {
        console.log(`✅ Unassigned PO found: ${unassignedPO.id} with ${unassignedPO.items.length} items`);
        console.log(`   Supplier ID: ${unassignedPO.supplier_id}`);
        if (unassignedPO.items.length !== 2) console.error('❌ Expected 2 items in unassigned PO');
        if (unassignedPO.supplier_name) console.error('❌ Expected no supplier name for unassigned PO');
    } else {
        console.error('❌ Unassigned PO not found');
    }

    if (pos.length === 2 && assignedPO && unassignedPO) {
        console.log('🎉 Verification SUCCEEDED');
    } else {
        console.error('💥 Verification FAILED');
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
