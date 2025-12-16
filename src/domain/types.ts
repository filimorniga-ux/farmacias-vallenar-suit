
export type Role = 'MANAGER' | 'QF' | 'CASHIER' | 'WAREHOUSE' | 'ADMIN' | 'GERENTE_GENERAL';
export type DrugCategory = string; // 'MEDICAMENTO' | 'INSUMO_MEDICO' | 'RETAIL_BELLEZA' | 'SUPLEMENTO' (Dynamic)
export type SaleCondition = 'VD' | 'R' | 'RR' | 'RCH';
export type StorageCondition = 'AMBIENTE' | 'REFRIGERADO' | 'CONTROLADO';

// --- Inventario y Logística ---
export interface Location {
    id: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
    name: string;
    address: string;
    associated_kiosks: string[]; // Kiosk IDs
    parent_id?: string;
    default_warehouse_id?: string; // NEW: Explicit WMS link
    config?: LocationConfig;
    is_active?: boolean; // NEW: Status toggle
}

export interface LocationConfig {
    receipt_template?: {
        header_text?: string;
        show_logo?: boolean;
        footer_text?: string;
        social_media?: string;
        show_barcode?: boolean;
    };
    queue_ticket_template?: {
        welcome_message?: string;
        show_qr?: boolean;
        wifi_info?: string;
        show_barcode?: boolean;
    };
}

export interface KioskConfig {
    id: string;
    type: 'ATTENDANCE' | 'QUEUE';
    location_id: string;
    status: 'ACTIVE' | 'INACTIVE';
    pairing_code?: string; // For setup
}

export interface InventoryBatch {
    id: string;
    sku: string;
    name: string;
    dci?: string; // Principio Activo (Optional)
    laboratory?: string; // Laboratorio (Optional)
    isp_register?: string; // Registro ISP (Optional)
    format?: string; // Comprimido, Jarabe (Optional)
    units_per_box?: number; // Unidades por caja (Optional, Default 1)
    is_bioequivalent?: boolean; // Es Bioequivalente (Optional)

    // Legacy / Optional / Derived
    concentration: string;
    unit_count: number;
    is_generic: boolean;
    bioequivalent_status: 'BIOEQUIVALENTE' | 'NO_BIOEQUIVALENTE';
    brand?: string;
    image_url?: string;
    condition: SaleCondition;

    // Identification
    barcode?: string;
    administration_route?: 'ORAL' | 'TOPICA' | 'OFTALMICA' | 'NASAL' | 'RECTAL' | 'VAGINAL' | 'PARENTERAL';

    // Logistics
    location_id: string;
    warehouse_id?: string; // Specific Warehouse ID (if different from location_id)
    aisle?: string;
    stock_actual: number;
    stock_min: number;
    stock_max: number;
    safety_stock?: number; // NEW: Buffer de seguridad
    expiry_date: number;
    lot_number?: string;

    // Financials (Advanced Structure)
    cost_net: number; // Costo Neto Compra
    tax_percent: number; // IVA (19%)
    price_sell_box: number; // Precio Venta Caja
    price_sell_unit: number; // Precio Venta Unitario (Calculado)
    margin_percentage?: number; // NEW: Margen calculado

    // Deprecated (Mapped for compatibility)
    price: number;
    cost_price: number;

    supplier_id?: string;
    preferred_supplier_id?: string; // NEW: Proveedor preferido para auto-reorden
    lead_time_days?: number; // NEW: Tiempo de entrega del proveedor

    category: DrugCategory;
    subcategory?: string; // NEW: Subcategoría
    allows_commission: boolean;
    active_ingredients: string[];

    // Clinical Metadata
    therapeutic_tags?: string[];
    contraindications?: string[];
    storage_condition?: 'AMBIENTE' | 'REFRIGERADO' | 'CONTROLADO';

    // Fractionation
    is_fractionable?: boolean;
    fractional_price?: number;

    // Sanitary Compliance
    unit_format_string?: string;
    units_per_package?: number; // Alias for units_per_box
    price_per_unit?: number;
    bioequivalent?: boolean; // Alias
    active_ingredient?: string; // Alias
}

// Stock Movement Tracking
export type StockMovementType =
    | 'SALE'           // Customer purchase
    | 'TRANSFER_OUT'   // Sent to another location
    | 'TRANSFER_IN'    // Received from another location
    | 'RECEIPT'        // Purchase order received
    | 'ADJUSTMENT'     // Manual correction (audit, damage, etc.)
    | 'RETURN';        // Customer return

export interface StockMovement {
    id: string;
    sku: string;
    product_name: string; // Denormalized for reporting
    location_id: string;
    movement_type: StockMovementType;
    quantity: number; // Positive = increase, Negative = decrease
    stock_before: number;
    stock_after: number;
    reference_id?: string; // ID of sale, transfer, or PO
    reference_type?: 'SALE' | 'SHIPMENT' | 'PURCHASE_ORDER';
    timestamp: number;
    user_id: string;
    user_name?: string; // Denormalized
    notes?: string;
    batch_id: string; // Link to specific InventoryBatch
}


// --- Recursos Humanos ---
export type AttendanceStatus = 'IN' | 'OUT' | 'LUNCH' | 'ON_PERMISSION';

export type JobTitle =
    | 'QUIMICO_FARMACEUTICO'
    | 'AUXILIAR_FARMACIA'
    | 'BODEGUERO'
    | 'ADMINISTRATIVO'
    | 'ALUMNO_PRACTICA'
    | 'GERENTE_GENERAL'
    | 'DIRECTOR_TECNICO'
    | 'CAJERO_VENDEDOR'
    | 'ASISTENTE_BODEGA';

export interface EmployeeProfile {
    id: string;
    rut: string;
    name: string;
    role: Role; // System Role (Permissions)
    access_pin: string; // 4 dígitos
    status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
    base_location_id?: string; // Sucursal Base (Contractual)
    assigned_location_id?: string; // Dónde trabaja hoy (Operativo)
    token_version?: number;

    // Personal Data
    contact_phone?: string;
    emergency_contact?: {
        name: string;
        relation: string;
        phone: string;
    };

    // Contractual Data (Manager Only)
    job_title: JobTitle; // Contractual Title (Now Required)
    base_salary?: number;
    weekly_hours?: number;
    pension_fund?: string; // AFP
    health_system?: string; // Isapre/Fonasa
    mutual_safety?: string;

    // Security
    allowed_modules?: string[]; // Custom permissions

    // Biometrics & Attendance
    biometric_credentials?: string[]; // WebAuthn Credential IDs
    current_status: AttendanceStatus;
}

export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'PERMISSION_START' | 'PERMISSION_END' | 'MEDICAL_LEAVE' | 'EMERGENCY' | 'WORK_ACCIDENT';

export interface AttendanceLog {
    id: string;
    employee_id: string;
    timestamp: number;
    type: AttendanceType;
    overtime_minutes?: number;
    delay_minutes?: number;
    observation?: string;
    evidence_photo_url?: string;
}

// --- Venta y Clientes ---
export type HealthTag = 'HYPERTENSION' | 'PREGNANT' | 'DIABETIC' | 'ELDERLY' | 'PEDIATRIC';

export interface Customer {
    id: string; // UUID
    rut: string;
    fullName: string; // Replaces 'name'
    phone?: string; // WhatsApp
    email?: string;
    totalPoints: number;
    registrationSource: 'KIOSK' | 'POS' | 'ADMIN';
    lastVisit: number; // Timestamp

    // New CRM Fields
    total_spent: number; // Life-time value
    tags: string[]; // ['VIP', 'CRONICO', 'TERCERA_EDAD']
    status: 'ACTIVE' | 'BANNED';

    // Legacy/Computed properties for compatibility
    name: string; // Alias for fullName
    age: number; // Derived or optional
    health_tags: HealthTag[];
}

export interface LoyaltyConfig {
    earn_rate: number; // Amount to spend to earn 1 point (e.g., 100)
    burn_rate: number; // Value of 1 point in currency (e.g., 1)
    min_points_to_redeem: number; // Minimum points required to redeem
}

export interface SaleItem {
    batch_id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    allows_commission: boolean;
    active_ingredients?: string[]; // Optional for backward compatibility or if not loaded
    is_fractional?: boolean;
    original_name?: string;
    cost_price?: number; // Added for financial reporting
}

export interface SaleTransaction {
    id: string;
    timestamp: number;
    items: SaleItem[];
    total: number;
    payment_method: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER';
    transfer_id?: string; // Obligatorio si es TRANSFER
    prescription_type?: 'SIMPLE' | 'RETENIDA'; // Obligatorio si hay medicamentos R/RR
    customer?: Customer;
    seller_id: string;
    dte_code?: string; // Código SII
    dte_status?: 'CONFIRMED_DTE' | 'FISCALIZED_BY_VOUCHER';
    dte_folio?: string; // Folio Boleta o N/A
    branch_id?: string; // Added for location tracking
    shift_id?: string; // Linked to a specific shift
    terminal_id?: string; // Specific POS Terminal
    is_synced?: boolean; // Offline Sync Flag
}

// --- POS & Turnos ---
export interface Terminal {
    id: string;
    name: string;
    location_id: string;
    status: 'OPEN' | 'CLOSED';
    allowed_users?: string[]; // IDs of employees allowed to use this terminal. Empty = All.
    current_cashier_id?: string; // If OPEN, who is using it
    // Telementry
    current_cashier_name?: string;
    opened_at?: number;
    authorized_by_name?: string;
    blind_counts_count?: number;
    is_active?: boolean;
    deleted_at?: string; // For soft deletes
    printer_config?: {
        receipt_printer_id?: string;
        label_printer_id?: string;
    };
}

export interface Warehouse {
    id: string;
    location_id: string;
    name: string;
    is_active: boolean;
}

export interface Shift {
    id: string;
    terminal_id: string;
    user_id: string; // The cashier
    authorized_by: string; // The manager
    start_time: number;
    end_time?: number;
    opening_amount: number;
    closing_amount?: number;
    difference?: number;
    status: 'ACTIVE' | 'CLOSED';
}

export interface Quote {
    id: string; // COT-123456
    created_at: number;
    expires_at: number;
    customer_id?: string;
    total_amount: number;
    status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED';
    items: CartItem[];
}

// --- Cadena de Suministro ---
// --- Cadena de Suministro ---
export interface SupplierContact {
    name: string;
    role: string; // 'SALES' | 'BILLING' | 'LOGISTICS' | 'MANAGER'
    email: string;
    phone: string;
    is_primary: boolean;
}

export interface BankAccount {
    bank: string;
    account_type: 'VISTA' | 'CORRIENTE' | 'AHORRO';
    account_number: string;
    email_notification: string;
    rut_holder?: string; // If different from supplier RUT
}

export interface Supplier {
    id: string;
    rut: string; // Validated
    business_name: string; // Razón Social
    fantasy_name: string; // Nombre Fantasía
    website?: string;
    logo_url?: string;

    // Location (NEW)
    address: string;
    region: string;
    city: string;
    commune: string;
    postal_code?: string;

    // Contact (EXTENDED)
    phone_1: string;
    phone_2?: string;
    contact_email: string; // General email
    email_orders: string; // Para enviar O.C.
    email_billing: string; // Para recibir facturas
    contacts: SupplierContact[];

    // Commercial (EXTENDED)
    sector: string; // Rubro (Laboratorio, Distribuidora, Insumos)
    brands: string[]; // Array de marcas que distribuye
    categories: ('MEDICAMENTOS' | 'INSUMOS' | 'RETAIL' | 'SERVICIOS')[];
    payment_terms: 'CONTADO' | '30_DIAS' | '60_DIAS' | '90_DIAS';
    credit_limit?: number;
    rating: 1 | 2 | 3 | 4 | 5;
    lead_time_days: number;

    // Banking
    bank_account?: BankAccount;
}

export interface SupplierDocument {
    id: string;
    supplier_id: string;
    type: 'FACTURA' | 'NOTA_CREDITO' | 'GUIA_DESPACHO';
    number: string; // Folio
    amount: number;
    issue_date: number;
    due_date: number;
    status: 'PENDING' | 'PAID' | 'APPLIED' | 'OVERDUE';
    pdf_url?: string;
    related_po_id?: string; // Link to Purchase Order
}

export type POStatus = 'SUGGESTED' | 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';

export interface CartItem {
    id: string; // Batch ID
    sku: string;
    name: string;
    price: number;
    quantity: number;
    is_manual?: boolean;
    batch_id?: string; // Optional if id is used as batch_id
    allows_commission?: boolean;
    active_ingredients?: string[];
    is_fractional?: boolean;
    original_name?: string;
    cost_price?: number; // Added for financial reporting
}

export interface PurchaseOrderItem {
    sku: string;
    name: string;
    quantity_ordered: number;
    quantity_received: number; // Track receipt progress
    cost_price: number;
    suggested_quantity?: number; // For intelligent ordering
    // Legacy compatibility
    quantity?: number;
    received_qty?: number;
}

export interface PurchaseOrder {
    id: string;
    supplier_id: string;
    supplier_name?: string; // Denormalized for display
    destination_location_id: string; // Where stock will arrive
    created_at: number;
    sent_at?: number; // When sent to supplier
    received_at?: number; // When fully received
    status: POStatus;
    items: PurchaseOrderItem[];
    total_estimated: number;
    is_auto_generated: boolean; // Generated by intelligent ordering
    generation_reason?: 'LOW_STOCK' | 'FORECAST' | 'MANUAL'; // Why created
    notes?: string;
}

// Reorder Configuration (Per Product Per Location)
export interface ReorderConfig {
    sku: string;
    location_id: string;
    min_stock: number; // Reorder point
    max_stock: number; // Target stock level
    safety_stock: number; // Extra buffer for uncertainty
    auto_reorder_enabled: boolean;
    preferred_supplier_id?: string;
    lead_time_days: number; // How long delivery takes
    review_period_days: number; // How often to check (default 7)
}

// Auto-Order Suggestion
export interface AutoOrderSuggestion {
    sku: string;
    product_name: string;
    location_id: string;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    daily_avg_sales: number;
    forecast_demand_14d: number; // Next 14 days forecast
    days_until_stockout: number;
    suggested_order_qty: number;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    supplier_id?: string;
    estimated_cost?: number;
}

// --- Configuración de Hardware ---
export interface PrinterConfig {
    auto_print_sale: boolean;
    auto_print_cash: boolean;
    auto_print_queue: boolean;
    header_text: string;
    footer_text: string;
    printer_ip?: string; // For network printers
}

export interface HardwareConfig {
    pos_printer_width: '58mm' | '80mm';
    label_printer_size: '50x25' | '100x50';
    auto_print_pos: boolean;
    auto_print_labels: boolean;
    scanner_mode: 'KEYBOARD_WEDGE' | 'HID';
    kiosk_printer_width?: '58mm' | '80mm';
    kiosk_welcome_message?: string;
}

// --- Atención y Filas ---
export interface QueueTicket {
    id: string;
    number: string; // A-001
    rut: string; // User ID or 'ANON'
    timestamp: number;
    status: 'WAITING' | 'CALLED' | 'COMPLETED' | 'SKIPPED';
    counter?: string; // Box 1
    branch_id: string; // Sucursal
}

// --- AI y Compliance ---
export interface ClinicalAnalysisResult {
    status: 'SAFE' | 'WARNING' | 'BLOCK';
    message: string;
    blocking_items?: string[];
    suggested_items?: string[]; // Cross-selling
}

// --- Finanzas y Gastos ---
export type ExpenseCategory = 'MERCADERIA' | 'GASTOS_MENORES' | 'NOMINA' | 'IMPUESTOS' | 'SERVICIOS_BASICOS' | 'ARRIENDO' | 'OTROS';

export interface Expense {
    id: string;
    description: string;
    amount: number;
    category: ExpenseCategory;
    date: number; // Timestamp
    is_deductible: boolean; // Si tiene factura/boleta válida
    document_type?: 'FACTURA' | 'BOLETA' | 'SIN_RESPALDO';
}

// --- Gestión de Caja (Cash Flow) ---
export type CashMovementType = 'IN' | 'OUT';
export type CashMovementReason = 'SUPPLIES' | 'SERVICES' | 'WITHDRAWAL' | 'OTHER' | 'INITIAL_FUND' | 'OTHER_INCOME' | 'SALARY_ADVANCE' | 'CHANGE' | 'OWNER_CONTRIBUTION';

export interface CashMovement {
    id: string;
    shift_id: string;
    timestamp: number;
    type: CashMovementType;
    amount: number;
    reason: CashMovementReason;
    description: string;
    evidence_url?: string; // URL de la foto
    is_cash: boolean; // Si afecta el efectivo físico
    user_id: string;
}

export interface CashShift {
    id: string;
    user_id: string; // Deprecated in favor of openedBy? Or keep as "Owner"
    openedBy: string;
    authorizedBy?: string;
    closedBy?: string;
    shiftNumber: number;
    start_time: number;
    end_time?: number;
    opening_amount: number; // Base
    status: 'OPEN' | 'CLOSED';
    closing_amount?: number; // Lo que se contó
    difference?: number; // Sobrante/Faltante
}

// --- WMS & Logistics ---
// --- WMS & Logistics ---
export interface Shipment {
    id: string; // UUID
    type: 'INBOUND_PROVIDER' | 'INTERNAL_TRANSFER' | 'RETURN';
    origin_location_id: string; // Bodega o Proveedor
    destination_location_id: string; // Sucursal receptora
    status: 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'RECEIVED_WITH_DISCREPANCY' | 'CANCELLED';

    transport_data: {
        carrier: string; // Ej: Starken, Chilexpress
        tracking_number: string; // OT
        package_count: number;
        driver_name?: string;
    };

    documentation: {
        invoice_url?: string;
        dispatch_guide_url?: string;
        evidence_photos: string[];
        observations?: string;
    };

    items: {
        batchId: string;
        sku: string;
        name: string; // Denormalized
        quantity: number;
        condition: 'GOOD' | 'DAMAGED';
        // Inherited Batch Data (Snapshot)
        lot_number?: string;
        expiry_date?: number;
        dci?: string;
        unit_price?: number;
    }[];

    valuation: number; // Valor total
    created_at: number;
    updated_at: number;
}

export interface StockTransfer {
    // Legacy support or alias to Shipment if needed, but keeping separate for now to avoid breaking existing code immediately
    // In a full refactor, this would be replaced by Shipment
    id: string;
    origin_location_id: string;
    destination_location_id: string;
    status: 'DRAFT' | 'PACKED' | 'IN_TRANSIT' | 'RECEIVED' | 'DISPUTED';
    items: {
        sku: string;
        batchId: string;
        quantity: number;
        productName: string;
    }[];
    shipment_data: {
        carrier_name: string;
        tracking_number: string;
        driver_name?: string;
    };
    evidence: {
        photos: string[];
        documents: string[];
    };
    timeline: {
        created_at: number;
        dispatched_at?: number;
        received_at?: number;
    };
    created_by: string;
}

export interface WarehouseIncident {
    id: string;
    transfer_id?: string;
    type: 'DAMAGED' | 'MISSING' | 'EXPIRED' | 'EXTRA';
    description: string;
    items: {
        sku: string;
        quantity: number;
    }[];
    status: 'OPEN' | 'RESOLVED';
    reported_at: number;
    resolved_at?: number;
    evidence_urls: string[];
}

// --- SII (Servicio de Impuestos Internos) ---
export type SiiAmbiente = 'CERTIFICACION' | 'PRODUCCION';
export type DteStatus = 'PENDIENTE' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ACEPTADO_CON_REPAROS';
export type DteTipo = 33 | 39 | 61 | 56; // 33: Factura, 39: Boleta, 61: NC, 56: ND

export interface SiiConfiguration {
    id: string;
    rut_emisor: string;
    razon_social: string;
    giro: string;
    acteco: number;

    // Security (Encrypted/Base64)
    certificado_pfx_base64: string;
    certificado_password: string; // Should be encrypted
    fecha_vencimiento_firma: number; // Timestamp

    ambiente: SiiAmbiente;

    created_at?: number;
    updated_at?: number;
}

export interface SiiCaf {
    id: string;
    tipo_dte: DteTipo;
    xml_content: string; // Raw CAF XML
    rango_desde: number;
    rango_hasta: number;
    folios_usados: number;
    fecha_carga: number;
    active: boolean;
}

export interface DteDocument {
    folio: number;
    tipo: DteTipo;
    rut_emisor: string;

    track_id?: string; // SII Track ID
    status: DteStatus;

    xml_final?: string; // The signed XML
    pdf_url?: string;

    monto_total: number;
    fecha_emision: number;
}

// --- Marketing & Promociones ---
export interface Promotion {
    id: string;
    name: string;
    startDate: number;
    endDate: number;
    isActive: boolean;
    type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BOGO' | 'BUNDLE';
    value?: number; // % or Amount
    target_category?: string;
    required_customer_tag?: string;
    days_of_week?: number[]; // 0=Sunday, 1=Monday...
}

export interface GiftCard {
    code: string;
    balance: number;
    initial_balance: number;
    status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
    created_at: number;
    expiry_date?: number;
}

export interface LoyaltyReward {
    id: string;
    name: string;
    points_cost: number;
    product_sku?: string;
    description?: string;
}
