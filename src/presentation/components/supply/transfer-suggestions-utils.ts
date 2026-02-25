export interface TransferQuantityInput {
    requestedQty?: number;
    suggestedQty: number;
    availableQty: number;
}

function toSafeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

export function resolveTransferQuantity({
    requestedQty,
    suggestedQty,
    availableQty
}: TransferQuantityInput): number {
    const safeAvailable = toSafeInt(availableQty);
    if (safeAvailable === 0) return 0;

    const safeSuggested = toSafeInt(suggestedQty);
    const defaultQty = Math.min(safeSuggested, safeAvailable);

    if (requestedQty === undefined || requestedQty === null || Number.isNaN(requestedQty)) {
        return defaultQty;
    }

    return Math.min(Math.max(1, toSafeInt(requestedQty)), safeAvailable);
}

