export type SupplyKanbanColumnKey = 'DRAFT' | 'APPROVED' | 'SENT' | 'RECEIVED';
export type SupplyKanbanEntrySource = 'PO' | 'SHIPMENT';

export interface SupplyKanbanEntry {
    id: string;
    source: SupplyKanbanEntrySource;
    column: SupplyKanbanColumnKey;
    status: string;
    createdAt: number;
    title: string;
    subtitle: string;
    itemCount: number;
    notes?: string;
    payload: Record<string, unknown>;
}

interface SupplierLike {
    id: string;
    fantasy_name?: string;
    business_name?: string;
}

const PO_STATUS_COLUMN_MAP: Record<string, SupplyKanbanColumnKey | undefined> = {
    SUGGESTED: 'DRAFT',
    DRAFT: 'DRAFT',
    APPROVED: 'APPROVED',
    SENT: 'SENT',
    ORDERED: 'SENT',
    PARTIAL: 'SENT',
    RECEIVED: 'RECEIVED',
    COMPLETED: 'RECEIVED',
};

const SHIPMENT_STATUS_COLUMN_MAP: Record<string, SupplyKanbanColumnKey | undefined> = {
    PREPARING: 'APPROVED',
    PENDING: 'APPROVED',
    APPROVED: 'APPROVED',
    IN_TRANSIT: 'SENT',
    DELIVERED: 'RECEIVED',
    RECEIVED_WITH_DISCREPANCY: 'RECEIVED',
};

function safeNumber(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toDateMs(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    return Date.now();
}

function supplierLabel(order: Record<string, unknown>, suppliers: SupplierLike[]): string {
    const direct =
        (typeof order.supplier_name === 'string' && order.supplier_name) ||
        (typeof order.supplierName === 'string' && order.supplierName);
    if (direct) return direct;

    const supplierId = typeof order.supplier_id === 'string'
        ? order.supplier_id
        : typeof order.supplierId === 'string'
            ? order.supplierId
            : null;

    if (!supplierId) return 'Proveedor Desconocido';

    const match = suppliers.find((supplier) => supplier.id === supplierId);
    return match?.fantasy_name || match?.business_name || 'Proveedor Desconocido';
}

function routeLabel(shipment: Record<string, unknown>): string {
    const origin = typeof shipment.origin_location_name === 'string'
        ? shipment.origin_location_name
        : typeof shipment.originLocationName === 'string'
            ? shipment.originLocationName
            : 'Origen';
    const destination = typeof shipment.destination_location_name === 'string'
        ? shipment.destination_location_name
        : typeof shipment.destinationLocationName === 'string'
            ? shipment.destinationLocationName
            : 'Destino';

    return `${origin} → ${destination}`;
}

function poItemCount(order: Record<string, unknown>): number {
    if (Array.isArray(order.items)) {
        return order.items.length;
    }

    return safeNumber(order.items_count, 0);
}

function shipmentItemCount(shipment: Record<string, unknown>): number {
    if (Array.isArray(shipment.items)) {
        return shipment.items.length;
    }

    if (Array.isArray(shipment.shipment_items)) {
        return shipment.shipment_items.length;
    }

    return safeNumber(shipment.items_count, 0);
}

export function resolvePOColumn(status: unknown): SupplyKanbanColumnKey | null {
    if (typeof status !== 'string') return null;
    return PO_STATUS_COLUMN_MAP[status] || null;
}

export function resolveShipmentColumn(status: unknown): SupplyKanbanColumnKey | null {
    if (typeof status !== 'string') return null;
    return SHIPMENT_STATUS_COLUMN_MAP[status] || null;
}

export function buildSupplyKanbanEntries(params: {
    purchaseOrders: unknown[];
    shipments: unknown[];
    suppliers?: SupplierLike[];
}): SupplyKanbanEntry[] {
    const suppliers = params.suppliers || [];
    const poEntries: SupplyKanbanEntry[] = params.purchaseOrders
        .map((raw): SupplyKanbanEntry | null => {
            if (!raw || typeof raw !== 'object') return null;
            const order = raw as Record<string, unknown>;
            const column = resolvePOColumn(order.status);
            if (!column) return null;

            const id = typeof order.id === 'string' ? order.id : `PO-${Math.random().toString(36).slice(2, 10)}`;
            const status = typeof order.status === 'string' ? order.status : 'UNKNOWN';

            return {
                id,
                source: 'PO',
                column,
                status,
                createdAt: toDateMs(order.created_at),
                title: supplierLabel(order, suppliers),
                subtitle: 'Orden de Compra',
                itemCount: poItemCount(order),
                notes: typeof order.notes === 'string' ? order.notes : undefined,
                payload: order,
            };
        })
        .filter((entry): entry is SupplyKanbanEntry => entry !== null);

    const shipmentEntries: SupplyKanbanEntry[] = params.shipments
        .map((raw): SupplyKanbanEntry | null => {
            if (!raw || typeof raw !== 'object') return null;
            const shipment = raw as Record<string, unknown>;
            const column = resolveShipmentColumn(shipment.status);
            if (!column) return null;

            const id = typeof shipment.id === 'string'
                ? shipment.id
                : `SHP-${Math.random().toString(36).slice(2, 10)}`;
            const status = typeof shipment.status === 'string' ? shipment.status : 'UNKNOWN';
            const movementType = typeof shipment.type === 'string' ? shipment.type : 'MOVIMIENTO';

            return {
                id,
                source: 'SHIPMENT',
                column,
                status,
                createdAt: toDateMs(shipment.created_at),
                title: routeLabel(shipment),
                subtitle: `Movimiento WMS · ${movementType}`,
                itemCount: shipmentItemCount(shipment),
                notes: typeof shipment.notes === 'string' ? shipment.notes : undefined,
                payload: shipment,
            };
        })
        .filter((entry): entry is SupplyKanbanEntry => entry !== null);

    return [...poEntries, ...shipmentEntries].sort((a, b) => b.createdAt - a.createdAt);
}
