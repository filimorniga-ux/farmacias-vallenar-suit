import { InventoryBatch, EmployeeProfile, Supplier, Shipment } from './types';

// --- DATOS REALES FARMACIAS VALLENAR ---
export const MOCK_INVENTORY: InventoryBatch[] = [
    // --- TOP VENTAS & CRÓNICOS ---
    {
        id: 'P001', sku: '780001', name: 'PARACETAMOL 500MG', dci: 'PARACETAMOL', laboratory: 'Mintlab', condition: 'VD',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'GÓNDOLA',
        stock_actual: 2000, stock_min: 200, stock_max: 3000, expiry_date: new Date('2026-12-01').getTime(),
        price: 990, cost_price: 400,
        cost_net: 336, tax_percent: 19, price_sell_box: 990, price_sell_unit: 62,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Paracetamol'], therapeutic_tags: ['DOLOR', 'FIEBRE', 'CABEZA'],
        storage_condition: 'AMBIENTE', concentration: '500mg', format: 'Comprimido', unit_count: 16, is_generic: true,
        isp_register: 'F-1234/20', units_per_box: 16, unit_format_string: 'Comprimidos', price_per_unit: 62
    },
    {
        id: 'P002', sku: '780002', name: 'LOSARTÁN 50MG', dci: 'LOSARTÁN POTÁSICO', laboratory: 'Lab Chile', condition: 'R',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A1',
        stock_actual: 500, stock_min: 100, stock_max: 800, expiry_date: new Date('2025-06-01').getTime(),
        price: 2990, cost_price: 0,
        cost_net: 840, tax_percent: 19, price_sell_box: 2990, price_sell_unit: 100,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Losartán Potásico'], therapeutic_tags: ['HIPERTENSION', 'CORAZON'],
        contraindications: ['EMBARAZO'], storage_condition: 'AMBIENTE', concentration: '50mg', format: 'Comprimido', unit_count: 30, is_generic: true,
        isp_register: 'F-9988/21', units_per_box: 30, unit_format_string: 'Comprimidos', price_per_unit: 100
    },
    {
        id: 'P003', sku: '780003', name: 'IBUPROFENO 600MG', dci: 'IBUPROFENO', laboratory: 'Lab Chile', condition: 'VD',
        is_bioequivalent: true, bioequivalent_status: 'BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE A2',
        stock_actual: 800, stock_min: 100, stock_max: 1200, expiry_date: new Date('2026-01-01').getTime(),
        price: 1990, cost_price: 600,
        cost_net: 504, tax_percent: 19, price_sell_box: 1990, price_sell_unit: 100,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Ibuprofeno'], therapeutic_tags: ['DOLOR', 'INFLAMACION', 'CABEZA'],
        contraindications: ['ULCERA', 'EMBARAZO'], storage_condition: 'AMBIENTE', concentration: '600mg', format: 'Comprimido', unit_count: 20, is_generic: true,
        isp_register: 'F-5544/19', units_per_box: 20, unit_format_string: 'Comprimidos', price_per_unit: 100
    },
    {
        id: 'P004', sku: '780004', name: 'EUTIROX 100MCG', dci: 'LEVOTIROXINA', laboratory: 'Merck', condition: 'R',
        is_bioequivalent: false, bioequivalent_status: 'NO_BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'ESTANTE B1',
        stock_actual: 150, stock_min: 30, stock_max: 300, expiry_date: new Date('2025-10-01').getTime(),
        price: 8500, cost_price: 3500,
        cost_net: 2941, tax_percent: 19, price_sell_box: 8500, price_sell_unit: 170,
        category: 'MEDICAMENTO', allows_commission: false, active_ingredients: ['Levotiroxina'], therapeutic_tags: ['TIROIDES'],
        storage_condition: 'AMBIENTE', concentration: '100mcg', format: 'Comprimido', unit_count: 50, is_generic: false,
        isp_register: 'F-2211/18', units_per_box: 50, unit_format_string: 'Comprimidos', price_per_unit: 170
    },

    // --- RETAIL & COMISIONABLES ---
    {
        id: 'R001', sku: 'RET-01', name: 'MAAM CREMA PRENATAL', dci: 'N/A', laboratory: 'Milab', brand: 'Maam', condition: 'VD',
        is_bioequivalent: false, bioequivalent_status: 'NO_BIOEQUIVALENTE', location_id: 'SUCURSAL_CENTRO', aisle: 'BELLEZA',
        stock_actual: 40, stock_min: 10, stock_max: 80, expiry_date: new Date('2027-01-01').getTime(),
        price: 15847, cost_price: 8000,
        cost_net: 6722, tax_percent: 19, price_sell_box: 15847, price_sell_unit: 15847,
        category: 'RETAIL_BELLEZA', allows_commission: true, active_ingredients: [], image_url: '/images/maam.jpg',
        storage_condition: 'AMBIENTE', concentration: 'N/A', format: 'Crema', unit_count: 1, is_generic: false,
        isp_register: 'N/A', units_per_box: 1, unit_format_string: 'Unidad', price_per_unit: 15847
    }
];

export const MOCK_EMPLOYEES: EmployeeProfile[] = [
    {
        id: 'u1',
        rut: '11.111.111-1',
        name: 'Miguel Pérez',
        role: 'MANAGER',
        access_pin: '1213',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'GERENTE_GENERAL',
        base_salary: 2500000,
        weekly_hours: 44,
        pension_fund: 'HABITAT',
        health_system: 'ISAPRE',
        mutual_safety: 'ACHS',
        allowed_modules: ['POS', 'INVENTORY', 'HR', 'REPORTS', 'SUPPLIERS']
    },
    {
        id: 'u2',
        rut: '22.222.222-2',
        name: 'Javiera QF',
        role: 'ADMIN',
        access_pin: '1213',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'DIRECTOR_TECNICO',
        base_salary: 1800000,
        weekly_hours: 44,
        pension_fund: 'MODELO',
        health_system: 'FONASA',
        allowed_modules: ['POS', 'INVENTORY', 'REPORTS', 'SUPPLIERS']
    },
    {
        id: 'u3',
        rut: '33.333.333-3',
        name: 'Cajero 1',
        role: 'CASHIER',
        access_pin: '1213',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'SUCURSAL_CENTRO',
        assigned_location_id: 'SUCURSAL_CENTRO',
        job_title: 'CAJERO_VENDEDOR',
        base_salary: 500000,
        weekly_hours: 45,
        pension_fund: 'PROVIDA',
        health_system: 'FONASA',
        allowed_modules: ['POS', 'INVENTORY']
    },
    {
        id: 'u4',
        rut: '44.444.444-4',
        name: 'Bodeguero',
        role: 'WAREHOUSE',
        access_pin: '1213',
        status: 'ACTIVE',
        current_status: 'OUT',
        base_location_id: 'BODEGA_CENTRAL',
        assigned_location_id: 'BODEGA_CENTRAL',
        job_title: 'ASISTENTE_BODEGA',
        base_salary: 550000,
        weekly_hours: 45,
        pension_fund: 'CAPITAL',
        health_system: 'FONASA',
        allowed_modules: ['INVENTORY', 'SUPPLIERS']
    },
];

export const MOCK_SUPPLIERS: Supplier[] = [
    {
        id: 'SUP-001',
        rut: '76.111.111-1',
        business_name: 'Laboratorio Chile S.A.',
        fantasy_name: 'LabChile',
        contact_email: 'ventas@labchile.cl',
        lead_time_days: 2,
        contacts: [
            { name: 'Juan Pérez', role: 'SALES', email: 'juan.perez@labchile.cl', phone: '+56911111111', is_primary: true },
            { name: 'María González', role: 'BILLING', email: 'facturacion@labchile.cl', phone: '+56911111112', is_primary: false }
        ],
        categories: ['MEDICAMENTOS'],
        payment_terms: '30_DIAS',
        rating: 5,
        bank_account: { bank: 'Banco de Chile', account_type: 'CORRIENTE', account_number: '111-222-333', email_notification: 'pagos@labchile.cl' },
        address: 'Av. Marathon 1315', region: 'RM', city: 'Santiago', commune: 'Ñuñoa', postal_code: '7750000',
        phone_1: '+56223334444', email_orders: 'pedidos@labchile.cl', email_billing: 'facturacion@labchile.cl', sector: 'LABORATORIO', brands: ['LabChile']
    },
    {
        id: 'SUP-002',
        rut: '76.222.222-2',
        business_name: 'Novo Nordisk Farmacéutica Ltda.',
        fantasy_name: 'Novo Nordisk',
        contact_email: 'orders@novo.com',
        lead_time_days: 5,
        contacts: [
            { name: 'Ana Silva', role: 'SALES', email: 'ana.silva@novo.com', phone: '+56922222222', is_primary: true }
        ],
        categories: ['MEDICAMENTOS', 'INSUMOS'],
        payment_terms: '60_DIAS',
        rating: 4,
        address: 'Av. Alonso de Córdova 5151', region: 'RM', city: 'Santiago', commune: 'Las Condes', postal_code: '7550000',
        phone_1: '+56225556666', email_orders: 'pedidos@novo.com', email_billing: 'billing@novo.com', sector: 'LABORATORIO', brands: ['Novo Nordisk']
    },
    {
        id: 'SUP-003',
        rut: '76.333.333-3',
        business_name: 'Droguería Hofmann S.A.',
        fantasy_name: 'Droguería Hofmann',
        contact_email: 'contacto@hofmann.cl',
        lead_time_days: 3,
        contacts: [],
        categories: ['INSUMOS', 'RETAIL'],
        payment_terms: 'CONTADO',
        rating: 3,
        address: 'San Ignacio 500', region: 'RM', city: 'Santiago', commune: 'Quilicura', postal_code: '8700000',
        phone_1: '+56227778888', email_orders: 'ventas@hofmann.cl', email_billing: 'pagos@hofmann.cl', sector: 'DISTRIBUIDORA', brands: ['Varios']
    },
];

export const MOCK_SHIPMENTS: Shipment[] = [
    // INBOUND from Laboratorio Chile
    {
        id: 'SHP-001',
        type: 'INBOUND',
        origin_location_id: 'PROVEEDOR_LABCHILE',
        destination_location_id: 'SUCURSAL_CENTRO',
        status: 'IN_TRANSIT',
        transport_data: {
            carrier: 'STARKEN',
            tracking_number: 'STK-2024-001',
            package_count: 3,
            driver_name: 'Juan Pérez'
        },
        documentation: {
            invoice_url: '/docs/invoice-001.pdf',
            dispatch_guide_url: '/docs/guide-001.pdf',
            evidence_photos: []
        },
        items: [
            { id: 'ITEM-P001', batchId: 'P001', sku: '780001', name: 'PARACETAMOL 500MG', quantity: 500, condition: 'GOOD' },
            { id: 'ITEM-P003', batchId: 'P003', sku: '780003', name: 'IBUPROFENO 600MG', quantity: 300, condition: 'GOOD' }
        ],
        valuation: 450000,
        created_at: Date.now() - 86400000, // 1 day ago
        updated_at: Date.now() - 86400000
    },
    // INBOUND from Droguería Ñuñoa
    {
        id: 'SHP-002',
        type: 'INBOUND',
        origin_location_id: 'PROVEEDOR_DROGÑUÑOA',
        destination_location_id: 'SUCURSAL_CENTRO',
        status: 'PREPARING',
        transport_data: {
            carrier: 'CHILEXPRESS',
            tracking_number: 'CHX-2024-002',
            package_count: 2,
        },
        documentation: {
            evidence_photos: []
        },
        items: [
            { id: 'ITEM-G003', batchId: 'G003', sku: 'LC-003', name: 'OMEPRAZOL 20MG', quantity: 200, condition: 'GOOD' },
            { id: 'ITEM-R001', batchId: 'R001', sku: 'RET-01', name: 'MAAM CREMA PRENATAL', quantity: 50, condition: 'GOOD' }
        ],
        valuation: 850000,
        created_at: Date.now() - 43200000, // 12 hours ago
        updated_at: Date.now() - 43200000
    },
    // OUTBOUND to Sucursal Norte
    {
        id: 'SHP-003',
        type: 'INTER_BRANCH',
        origin_location_id: 'SUCURSAL_CENTRO',
        destination_location_id: 'SUCURSAL_NORTE',
        status: 'IN_TRANSIT',
        transport_data: {
            carrier: 'FLOTA_PROPIA',
            tracking_number: 'FP-2024-003',
            package_count: 1,
            driver_name: 'Carlos Muñoz'
        },
        documentation: {
            dispatch_guide_url: '/docs/guide-003.pdf',
            evidence_photos: []
        },
        items: [
            { id: 'ITEM-P002', batchId: 'P002', sku: '780002', name: 'LOSARTÁN 50MG', quantity: 100, condition: 'GOOD' }
        ],
        valuation: 299000,
        created_at: Date.now() - 7200000, // 2 hours ago
        updated_at: Date.now() - 7200000
    },
    // RETURN (Logística Inversa)
    {
        id: 'SHP-004',
        type: 'RETURN',
        origin_location_id: 'SUCURSAL_CENTRO',
        destination_location_id: 'BODEGA_CENTRAL',
        status: 'PREPARING',
        transport_data: {
            carrier: 'STARKEN',
            tracking_number: 'STK-RET-001',
            package_count: 1,
        },
        documentation: {
            evidence_photos: []
        },
        items: [
            { id: 'ITEM-G001', batchId: 'G001', sku: 'LC-001', name: 'ACICLOVIR 200MG', quantity: 20, condition: 'DAMAGED' }
        ],
        valuation: 43340,
        created_at: Date.now() - 3600000, // 1 hour ago
        updated_at: Date.now() - 3600000
    }
];
