export interface TransferLotColorDefinition {
    key: string;
    label: string;
    className: string;
    hex: string;
}

export const TRANSFER_LOT_COLORS: readonly TransferLotColorDefinition[] = [
    { key: 'TURQUESA', label: 'Turquesa', className: 'bg-teal-100 text-teal-700 border-teal-200', hex: '#14b8a6' },
    { key: 'LIMA', label: 'Lima', className: 'bg-lime-100 text-lime-700 border-lime-200', hex: '#84cc16' },
    { key: 'AMBAR', label: 'Ambar', className: 'bg-amber-100 text-amber-700 border-amber-200', hex: '#f59e0b' },
    { key: 'ROSA', label: 'Rosa', className: 'bg-rose-100 text-rose-700 border-rose-200', hex: '#f43f5e' },
    { key: 'INDIGO', label: 'Indigo', className: 'bg-indigo-100 text-indigo-700 border-indigo-200', hex: '#6366f1' },
    { key: 'NARANJA', label: 'Naranja', className: 'bg-orange-100 text-orange-700 border-orange-200', hex: '#f97316' },
];

function getShipmentToken(shipmentId: string): string {
    return String(shipmentId || '').slice(0, 8).toUpperCase() || 'SINREF00';
}

export function getTransferLotColor(index: number): TransferLotColorDefinition {
    const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
    return TRANSFER_LOT_COLORS[safeIndex % TRANSFER_LOT_COLORS.length]!;
}

export function buildTransferLotNumber(shipmentId: string, itemIndex: number): string {
    const sequence = String(Math.max(1, itemIndex + 1)).padStart(3, '0');
    const color = getTransferLotColor(itemIndex);
    return `TRF-${getShipmentToken(shipmentId)}-${sequence}-${color.key}`;
}

export function buildDispatchLotNumber(shipmentId: string, itemIndex: number): string {
    const sequence = String(Math.max(1, itemIndex + 1)).padStart(3, '0');
    return `DSP-${getShipmentToken(shipmentId)}-${sequence}`;
}

export function extractTransferLotColorKey(lotNumber?: string | null): string | null {
    if (!lotNumber) return null;

    const normalized = String(lotNumber).trim().toUpperCase();
    if (!normalized.startsWith('TRF-')) return null;

    const parts = normalized.split('-');
    const candidate = parts[parts.length - 1];

    return TRANSFER_LOT_COLORS.some((item) => item.key === candidate) ? candidate : null;
}

export function getTransferLotColorByKey(key?: string | null): TransferLotColorDefinition | null {
    if (!key) return null;
    const normalized = String(key).trim().toUpperCase();
    return TRANSFER_LOT_COLORS.find((item) => item.key === normalized) || null;
}

export function getTransferLotVisualTag(lotNumber?: string | null): {
    label: string;
    className: string;
} | null {
    const key = extractTransferLotColorKey(lotNumber);
    const definition = getTransferLotColorByKey(key);
    if (!definition) return null;

    return {
        label: definition.label,
        className: definition.className
    };
}

export function getTransferLotColorLabel(lotNumber?: string | null): string | null {
    return getTransferLotVisualTag(lotNumber)?.label || null;
}
