export interface TransactionLike {
    type?: string;
    status?: string | null;
    dte_folio?: string | number | null;
    timestamp?: number | string | Date;
}

export interface SaleItemLike {
    quantity?: number | string | null;
    price?: number | string | null;
    unit_price?: number | string | null;
    unitPrice?: number | string | null;
    total_price?: number | string | null;
    total?: number | string | null;
    totalPrice?: number | string | null;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function getTransactionTitle(item: TransactionLike, fallbackId: string): string {
    const type = String(item.type || '').toUpperCase();
    const status = String(item.status || '').toUpperCase();
    const folio = item.dte_folio ? String(item.dte_folio) : fallbackId;

    if (type === 'SALE') {
        if (status === 'FULLY_REFUNDED') {
            return `Devolución #${folio}`;
        }
        if (status === 'PARTIALLY_REFUNDED') {
            return `Venta (Dev. Parcial) #${folio}`;
        }
        return `Venta #${folio}`;
    }
    if (type === 'REFUND') return `Devolución #${folio}`;

    if (type === 'EXTRA_INCOME') return 'Ingreso Extra';
    if (type === 'OPENING' || type === 'APERTURA') return 'Apertura de Caja';
    if (type === 'CLOSING' || type === 'CIERRE') return 'Cierre de Caja';
    if (type === 'EXPENSE' || type === 'WITHDRAWAL') return 'Gasto / Retiro';

    return type || 'Movimiento';
}

export function getSaleItemQuantity(item: SaleItemLike): number {
    const qty = toNumber(item.quantity);
    if (qty === null || qty <= 0) return 0;
    return qty;
}

export function getSaleItemUnitPrice(item: SaleItemLike): number {
    const explicit =
        toNumber(item.price) ??
        toNumber(item.unit_price) ??
        toNumber(item.unitPrice);

    if (explicit !== null && explicit >= 0) return explicit;

    const qty = getSaleItemQuantity(item);
    const total =
        toNumber(item.total_price) ??
        toNumber(item.total) ??
        toNumber(item.totalPrice);

    if (total !== null && qty > 0) return total / qty;

    return 0;
}

export function getSaleItemTotal(item: SaleItemLike): number {
    const explicit =
        toNumber(item.total_price) ??
        toNumber(item.total) ??
        toNumber(item.totalPrice);

    if (explicit !== null && explicit >= 0) return explicit;

    const qty = getSaleItemQuantity(item);
    const unit = getSaleItemUnitPrice(item);
    return qty * unit;
}
