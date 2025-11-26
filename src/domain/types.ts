
export type Role = 'MANAGER' | 'QF' | 'CASHIER' | 'WAREHOUSE' | 'ADMIN';
export type DrugCategory = 'MEDICAMENTO' | 'INSUMO_MEDICO' | 'RETAIL_BELLEZA' | 'SUPLEMENTO';
export type SaleCondition = 'VD' | 'R' | 'RR' | 'RCH';
export type StorageCondition = 'AMBIENTE' | 'REFRIGERADO' | 'CONTROLADO';

// --- Inventario y Logística ---
export interface Location {
    id: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
    name: string;
    address: string;
    associated_kiosks: string[]; // Kiosk IDs
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
    dci: string; // Principle Active
    laboratory?: string;
    brand?: string; // Retail brand
    image_url?: string;
    is_bioequivalent: boolean;
    condition: SaleCondition; // VD, R, RR, RCH

    // Logistics
    location_id: string; // Changed from strict union to string for dynamic locations
    aisle?: string; // Shelf/Rack location

    stock_actual: number;
    stock_min: number;
    stock_max: number;
    expiry_date: number; // Timestamp
    price: number;
    cost_price: number; // For valuation
    supplier_id?: string; // Optional for now

    category: DrugCategory;
    allows_commission: boolean;
    active_ingredients: string[]; // For clinical analysis

    // Clinical Metadata (New)
    therapeutic_tags?: string[]; // ['FIEBRE', 'DOLOR']
    contraindications?: string[]; // ['EMBARAZO', 'HIPERTENSION']
    storage_condition?: 'AMBIENTE' | 'REFRIGERADO' | 'CONTROLADO';
}

// --- Recursos Humanos ---
export type AttendanceStatus = 'IN' | 'OUT' | 'LUNCH';

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

export interface AttendanceLog {
    id: string;
    employee_id: string;
    timestamp: number;
    type: 'CHECK_IN' | 'CHECK_OUT' | 'LUNCH_START' | 'LUNCH_END';
    overtime_minutes?: number;
    delay_minutes?: number;
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

    // Legacy/Computed properties for compatibility
    name: string; // Alias for fullName
    age: number; // Derived or optional
    health_tags: HealthTag[];
}

export interface SaleItem {
    batch_id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    allows_commission: boolean;
    active_ingredients?: string[]; // Optional for backward compatibility or if not loaded
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

    // Contact
    contact_email: string; // General email
    contacts: SupplierContact[];

    // Commercial
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

export type POStatus = 'SUGGESTED' | 'DRAFT' | 'SENT' | 'PARTIAL' | 'COMPLETED';

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
}

export interface PurchaseOrderItem {
    sku: string;
    name: string;
    quantity: number;
    cost_price: number;
    received_qty?: number;
}

export interface PurchaseOrder {
    id: string;
    supplier_id: string;
    created_at: number;
    status: POStatus;
    items: PurchaseOrderItem[];
    total_estimated: number;
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
export type CashMovementReason = 'SUPPLIES' | 'SERVICES' | 'WITHDRAWAL' | 'OTHER' | 'INITIAL_FUND';

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
    user_id: string;
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
    status: 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'RECEIVED_WITH_DISCREPANCY';

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
    };

    items: {
        batchId: string;
        sku: string;
        name: string; // Denormalized
        quantity: number;
        condition: 'GOOD' | 'DAMAGED';
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
