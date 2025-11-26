
export type Role = 'ADMIN' | 'QF' | 'VENDEDOR' | 'WAREHOUSE';
export type DrugCategory = 'MEDICAMENTO' | 'INSUMO_MEDICO' | 'RETAIL_BELLEZA' | 'SUPLEMENTO';
export type SaleCondition = 'VD' | 'R' | 'RR' | 'RCH';

// --- Inventario y Logística ---
export interface InventoryBatch {
    id: string;
    name: string;
    dci: string;
    sku: string;
    category: DrugCategory;
    saleCondition: SaleCondition;
    isBioequivalent: boolean;
    isColdChain: boolean;
    isCommissionable: boolean;
    stockActual: number;
    stockMin: number;
    batchCode: string;
    expiryDate: string;
    supplierId: string;
    price: number;
}

// --- Recursos Humanos ---
export interface EmployeeProfile {
    id: string;
    name: string;
    rut: string;
    role: Role;
    baseSalary: number;
    commissionRate: number;
    lastClockIn: number;
    lastClockOut: number;
    isClockedIn: boolean;
}
export interface AttendanceLog {
    id: string;
    employeeId: string;
    timestamp: number;
    type: 'IN' | 'OUT' | 'BREAK';
}

// --- Venta y Clientes ---
export type HealthTag = 'HYPERTENSION' | 'PREGNANT' | 'DIABETIC';
export interface Customer {
    rut: string;
    name: string;
    age: number;
    healthTags: HealthTag[];
}
export interface SaleItem {
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    isCommissionable: boolean;
}

// --- Cadena de Suministro ---
export interface Supplier {
    id: string;
    name: string;
    rut: string;
}
export interface PurchaseOrder {
    id: string;
    supplierId: string;
    dateCreated: string;
    status: 'PENDING' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
    items: { itemId: string; name: string; quantity: number; expectedQty?: number }[];
}

// --- AI y Compliance ---
export interface ClinicalAnalysisResult {
    status: 'SAFE' | 'WARNING' | 'BLOCK';
    message: string;
    blockingItems?: string[];
    suggestedItems?: string[];
}
export interface QueueTicket {
    number: string;
    status: 'WAITING' | 'CALLING' | 'ATTENDED';
    rut?: string;
    timestamp: number;
}
